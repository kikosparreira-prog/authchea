const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../utils/db');
const { logAction } = require('../middleware/auth');

// ── POST /api/auth/register ───────────────────────────────────────
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    const ip = req.ip;

    if (!username || !email || !password)
        return res.status(400).json({ ok: false, msg: 'Preenche todos os campos' });

    if (username.length < 3 || username.length > 32)
        return res.status(400).json({ ok: false, msg: 'Username: 3-32 caracteres' });

    if (password.length < 6)
        return res.status(400).json({ ok: false, msg: 'Password: mínimo 6 caracteres' });

    try {
        // Check duplicates
        const [existing] = await db.query(
            'SELECT id FROM users WHERE username=? OR email=?', [username, email]
        );
        if (existing.length)
            return res.status(409).json({ ok: false, msg: 'Username ou email já existe' });

        const hash = await bcrypt.hash(password, 10);
        const [result] = await db.query(
            'INSERT INTO users (username, email, password_hash) VALUES (?,?,?)',
            [username, email, hash]
        );

        await logAction(result.insertId, 'register', null, ip);
        res.json({ ok: true, msg: 'Conta criada com sucesso!' });

    } catch (e) {
        console.error('[register]', e);
        res.status(500).json({ ok: false, msg: 'Erro interno' });
    }
});

// ── POST /api/auth/login ──────────────────────────────────────────
router.post('/login', async (req, res) => {
    const { username, password, hwid } = req.body;
    const ip = req.ip;

    if (!username || !password)
        return res.status(400).json({ ok: false, msg: 'Username e password obrigatórios' });

    try {
        const [rows] = await db.query(
            'SELECT * FROM users WHERE username=? OR email=?', [username, username]
        );
        if (!rows.length)
            return res.status(401).json({ ok: false, msg: 'Credenciais inválidas' });

        const user = rows[0];

        if (user.banned)
            return res.status(403).json({ ok: false, msg: `Conta banida: ${user.ban_reason || 'sem motivo'}` });

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match)
            return res.status(401).json({ ok: false, msg: 'Credenciais inválidas' });

        // HWID binding
        if (hwid) {
            if (!user.hwid) {
                // First login — bind HWID
                await db.query('UPDATE users SET hwid=? WHERE id=?', [hwid, user.id]);
            } else if (user.hwid !== hwid) {
                await logAction(user.id, 'hwid_mismatch', hwid, ip);
                return res.status(403).json({ ok: false, msg: 'HWID não coincide. Contacta o suporte para reset.' });
            }
        }

        // Update last login
        await db.query('UPDATE users SET last_login=NOW() WHERE id=?', [user.id]);

        // Get active license
        const [licenses] = await db.query(`
            SELECT l.*, p.name AS plan_name, p.duration, p.product
            FROM licenses l
            JOIN plans p ON l.plan_id = p.id
            WHERE l.user_id = ?
              AND l.banned = 0
              AND (l.expires_at IS NULL OR l.expires_at > NOW())
            ORDER BY l.expires_at DESC
            LIMIT 1
        `, [user.id]);

        const license = licenses[0] || null;

        // Generate JWT
        const token = jwt.sign(
            { userId: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        await logAction(user.id, 'login', null, ip);

        res.json({
            ok: true,
            msg: 'Login bem-sucedido',
            token,
            user: {
                id:       user.id,
                username: user.username,
                email:    user.email,
                role:     user.role,
            },
            license: license ? {
                key:        license.license_key,
                plan:       license.plan_name,
                product:    license.product,
                expires_at: license.expires_at,
                activated_at: license.activated_at,
            } : null,
        });

    } catch (e) {
        console.error('[login]', e);
        res.status(500).json({ ok: false, msg: 'Erro interno' });
    }
});

// ── POST /api/auth/logout ─────────────────────────────────────────
router.post('/logout', async (req, res) => {
    // JWT is stateless; client just discards the token
    // Optionally blacklist here if needed
    res.json({ ok: true, msg: 'Sessão terminada' });
});

module.exports = router;
