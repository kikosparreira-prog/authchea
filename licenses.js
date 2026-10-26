const router = require('express').Router();
const db     = require('../utils/db');
const { requireAuth, logAction } = require('../middleware/auth');
const { isExpired, timeLeft }    = require('../utils/keygen');

// ── POST /api/licenses/activate ─────────────────────────────────
// Ativar uma key numa conta de utilizador
router.post('/activate', requireAuth, async (req, res) => {
    const { license_key } = req.body;
    const userId = req.user.id;
    const ip = req.ip;

    if (!license_key)
        return res.status(400).json({ ok: false, msg: 'Key em falta' });

    const key = license_key.trim().toUpperCase();

    try {
        // Find license
        const [rows] = await db.query(
            'SELECT l.*, p.duration, p.name AS plan_name, p.product FROM licenses l JOIN plans p ON l.plan_id=p.id WHERE l.license_key=?',
            [key]
        );
        if (!rows.length)
            return res.status(404).json({ ok: false, msg: 'Key não encontrada' });

        const lic = rows[0];

        if (lic.banned)
            return res.status(403).json({ ok: false, msg: 'Key banida' });

        if (lic.used && lic.user_id !== userId)
            return res.status(409).json({ ok: false, msg: 'Key já ativada por outro utilizador' });

        if (lic.used && lic.user_id === userId)
            return res.status(409).json({ ok: false, msg: 'Key já ativada na tua conta' });

        if (isExpired(lic.expires_at))
            return res.status(410).json({ ok: false, msg: 'Key expirada' });

        // Calculate expiry from NOW (activation time)
        let expiresAt = null;
        if (lic.duration > 0) {
            expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + lic.duration);
        }

        await db.query(`
            UPDATE licenses SET
                user_id      = ?,
                activated_at = NOW(),
                expires_at   = ?,
                ip_address   = ?,
                used         = 1
            WHERE license_key = ?
        `, [userId, expiresAt, ip, key]);

        await logAction(userId, 'activate_key', key, ip);

        res.json({
            ok: true,
            msg: 'Key ativada com sucesso!',
            plan:       lic.plan_name,
            product:    lic.product,
            expires_at: expiresAt,
            time_left:  timeLeft(expiresAt),
        });

    } catch (e) {
        console.error('[activate]', e);
        res.status(500).json({ ok: false, msg: 'Erro interno' });
    }
});

// ── POST /api/licenses/validate ──────────────────────────────────
// Validar uma key (chamado pelo loader EXE)
router.post('/validate', async (req, res) => {
    const { license_key, hwid } = req.body;
    const ip = req.ip;

    if (!license_key || !hwid)
        return res.status(400).json({ ok: false, msg: 'Key e HWID obrigatórios' });

    const key = license_key.trim().toUpperCase();

    try {
        const [rows] = await db.query(`
            SELECT l.*, p.name AS plan_name, p.product, p.duration,
                   u.username, u.banned AS user_banned
            FROM licenses l
            JOIN plans p ON l.plan_id = p.id
            LEFT JOIN users u ON l.user_id = u.id
            WHERE l.license_key = ?
        `, [key]);

        if (!rows.length)
            return res.status(404).json({ ok: false, msg: 'Key inválida ou HWID incorreto' });

        const lic = rows[0];

        // Checks
        if (lic.banned)
            return res.status(403).json({ ok: false, msg: 'Key banida' });

        if (lic.user_banned)
            return res.status(403).json({ ok: false, msg: 'Conta banida' });

        if (!lic.used)
            return res.status(403).json({ ok: false, msg: 'Key não ativada. Ativa em frisgui.com' });

        if (isExpired(lic.expires_at))
            return res.status(410).json({ ok: false, msg: 'Key expirada' });

        // HWID check
        if (!lic.hwid) {
            // Bind HWID on first use
            await db.query('UPDATE licenses SET hwid=? WHERE license_key=?', [hwid, key]);
        } else if (lic.hwid !== hwid) {
            await logAction(lic.user_id, 'hwid_mismatch', `key=${key} hwid=${hwid}`, ip);
            return res.status(403).json({ ok: false, msg: 'Key inválida ou HWID incorreto' });
        }

        await logAction(lic.user_id, 'validate', key, ip);

        res.json({
            ok:         true,
            msg:        'Autenticado',
            username:   lic.username || 'user',
            plan:       lic.plan_name,
            product:    lic.product,
            expires_at: lic.expires_at,
            time_left:  timeLeft(lic.expires_at),
            subscriptions: [{
                subscription: lic.plan_name,
                expiry:       lic.expires_at ? Math.floor(new Date(lic.expires_at).getTime()/1000).toString() : '99999999999',
                timeleft:     lic.expires_at ? Math.floor((new Date(lic.expires_at)-new Date())/1000) : 99999999999,
            }]
        });

    } catch (e) {
        console.error('[validate]', e);
        res.status(500).json({ ok: false, msg: 'Erro interno' });
    }
});

// ── GET /api/licenses/me ──────────────────────────────────────────
// Ver as keys do utilizador autenticado
router.get('/me', requireAuth, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT l.license_key, l.activated_at, l.expires_at, l.banned,
                   p.name AS plan_name, p.product, p.duration
            FROM licenses l
            JOIN plans p ON l.plan_id = p.id
            WHERE l.user_id = ?
            ORDER BY l.created_at DESC
        `, [req.user.id]);

        res.json({
            ok: true,
            licenses: rows.map(r => ({
                key:          r.license_key,
                plan:         r.plan_name,
                product:      r.product,
                activated_at: r.activated_at,
                expires_at:   r.expires_at,
                time_left:    timeLeft(r.expires_at),
                expired:      isExpired(r.expires_at),
                banned:       !!r.banned,
            }))
        });
    } catch (e) {
        console.error('[licenses/me]', e);
        res.status(500).json({ ok: false, msg: 'Erro interno' });
    }
});

module.exports = router;
