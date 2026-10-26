const router = require('express').Router();
const db     = require('../utils/db');
const { requireAuth, requireAdmin, logAction } = require('../middleware/auth');
const { generateKey, calcExpiry } = require('../utils/keygen');

// Todas as rotas requerem autenticação + admin
router.use(requireAuth, requireAdmin);

// ── POST /api/admin/keys/generate ────────────────────────────────
// Gerar N keys de um plano
router.post('/keys/generate', async (req, res) => {
    let { plan_id, amount } = req.body;
    amount = Math.min(parseInt(amount) || 1, 100); // max 100 por vez

    if (!plan_id)
        return res.status(400).json({ ok: false, msg: 'plan_id obrigatório' });

    try {
        // Check plan exists
        const [plans] = await db.query('SELECT * FROM plans WHERE id=? AND active=1', [plan_id]);
        if (!plans.length)
            return res.status(404).json({ ok: false, msg: 'Plano não encontrado' });

        const plan = plans[0];
        const keys = [];

        for (let i = 0; i < amount; i++) {
            let key, exists;
            // Ensure unique key
            do {
                key = generateKey('FRIS');
                const [check] = await db.query('SELECT id FROM licenses WHERE license_key=?', [key]);
                exists = check.length > 0;
            } while (exists);

            await db.query(
                'INSERT INTO licenses (license_key, plan_id, created_by) VALUES (?,?,?)',
                [key, plan_id, req.user.id]
            );
            keys.push(key);
        }

        await logAction(req.user.id, 'generate_keys', `plan=${plan.name} amount=${amount}`, req.ip);

        res.json({
            ok: true,
            msg: `${amount} key(s) geradas com sucesso`,
            plan: plan.name,
            keys,
        });

    } catch (e) {
        console.error('[generate]', e);
        res.status(500).json({ ok: false, msg: 'Erro interno' });
    }
});

// ── GET /api/admin/keys ───────────────────────────────────────────
// Listar todas as keys (com filtros)
router.get('/keys', async (req, res) => {
    const { status, plan_id, search, limit = 50, offset = 0 } = req.query;
    let where = ['1=1'];
    let params = [];

    if (status === 'unused')  { where.push('l.used=0'); }
    if (status === 'active')  { where.push('l.used=1 AND (l.expires_at IS NULL OR l.expires_at > NOW())'); }
    if (status === 'expired') { where.push('l.used=1 AND l.expires_at IS NOT NULL AND l.expires_at <= NOW()'); }
    if (status === 'banned')  { where.push('l.banned=1'); }
    if (plan_id)              { where.push('l.plan_id=?'); params.push(plan_id); }
    if (search)               { where.push('(l.license_key LIKE ? OR u.username LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

    try {
        const [rows] = await db.query(`
            SELECT l.id, l.license_key, l.used, l.banned, l.ban_reason,
                   l.activated_at, l.expires_at, l.hwid, l.ip_address, l.created_at,
                   p.name AS plan_name, p.product, p.duration,
                   u.username
            FROM licenses l
            JOIN plans p ON l.plan_id = p.id
            LEFT JOIN users u ON l.user_id = u.id
            WHERE ${where.join(' AND ')}
            ORDER BY l.created_at DESC
            LIMIT ? OFFSET ?
        `, [...params, parseInt(limit), parseInt(offset)]);

        const [total] = await db.query(
            `SELECT COUNT(*) AS cnt FROM licenses l LEFT JOIN users u ON l.user_id=u.id WHERE ${where.join(' AND ')}`,
            params
        );

        res.json({ ok: true, keys: rows, total: total[0].cnt });
    } catch (e) {
        console.error('[admin/keys]', e);
        res.status(500).json({ ok: false, msg: 'Erro interno' });
    }
});

// ── POST /api/admin/keys/ban ──────────────────────────────────────
router.post('/keys/ban', async (req, res) => {
    const { license_key, reason } = req.body;
    if (!license_key) return res.status(400).json({ ok: false, msg: 'Key obrigatória' });

    try {
        await db.query('UPDATE licenses SET banned=1, ban_reason=? WHERE license_key=?',
            [reason || 'Banido pelo admin', license_key.toUpperCase()]);
        await logAction(req.user.id, 'ban_key', license_key, req.ip);
        res.json({ ok: true, msg: 'Key banida' });
    } catch (e) {
        res.status(500).json({ ok: false, msg: 'Erro interno' });
    }
});

// ── POST /api/admin/keys/unban ────────────────────────────────────
router.post('/keys/unban', async (req, res) => {
    const { license_key } = req.body;
    if (!license_key) return res.status(400).json({ ok: false, msg: 'Key obrigatória' });

    try {
        await db.query('UPDATE licenses SET banned=0, ban_reason=NULL WHERE license_key=?',
            [license_key.toUpperCase()]);
        await logAction(req.user.id, 'unban_key', license_key, req.ip);
        res.json({ ok: true, msg: 'Key desbanida' });
    } catch (e) {
        res.status(500).json({ ok: false, msg: 'Erro interno' });
    }
});

// ── POST /api/admin/keys/reset-hwid ─────────────────────────────
router.post('/keys/reset-hwid', async (req, res) => {
    const { license_key } = req.body;
    if (!license_key) return res.status(400).json({ ok: false, msg: 'Key obrigatória' });

    try {
        await db.query('UPDATE licenses SET hwid=NULL WHERE license_key=?',
            [license_key.toUpperCase()]);
        await logAction(req.user.id, 'reset_hwid', license_key, req.ip);
        res.json({ ok: true, msg: 'HWID resetado' });
    } catch (e) {
        res.status(500).json({ ok: false, msg: 'Erro interno' });
    }
});

// ── DELETE /api/admin/keys/:key ───────────────────────────────────
router.delete('/keys/:key', async (req, res) => {
    const key = req.params.key.toUpperCase();
    try {
        await db.query('DELETE FROM licenses WHERE license_key=?', [key]);
        await logAction(req.user.id, 'delete_key', key, req.ip);
        res.json({ ok: true, msg: 'Key eliminada' });
    } catch (e) {
        res.status(500).json({ ok: false, msg: 'Erro interno' });
    }
});

// ── GET /api/admin/users ──────────────────────────────────────────
router.get('/users', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT u.id, u.username, u.email, u.role, u.banned, u.ban_reason,
                   u.hwid, u.created_at, u.last_login,
                   COUNT(l.id) AS license_count
            FROM users u
            LEFT JOIN licenses l ON l.user_id = u.id
            GROUP BY u.id
            ORDER BY u.created_at DESC
            LIMIT 200
        `);
        res.json({ ok: true, users: rows });
    } catch (e) {
        res.status(500).json({ ok: false, msg: 'Erro interno' });
    }
});

// ── POST /api/admin/users/ban ─────────────────────────────────────
router.post('/users/ban', async (req, res) => {
    const { user_id, reason } = req.body;
    if (!user_id) return res.status(400).json({ ok: false, msg: 'user_id obrigatório' });
    if (user_id === req.user.id) return res.status(400).json({ ok: false, msg: 'Não podes banir a tua própria conta' });

    try {
        await db.query('UPDATE users SET banned=1, ban_reason=? WHERE id=?',
            [reason || 'Banido pelo admin', user_id]);
        await logAction(req.user.id, 'ban_user', `user_id=${user_id}`, req.ip);
        res.json({ ok: true, msg: 'Utilizador banido' });
    } catch (e) {
        res.status(500).json({ ok: false, msg: 'Erro interno' });
    }
});

// ── GET /api/admin/stats ──────────────────────────────────────────
router.get('/stats', async (req, res) => {
    try {
        const [[totalKeys]]   = await db.query('SELECT COUNT(*) AS n FROM licenses');
        const [[activeKeys]]  = await db.query('SELECT COUNT(*) AS n FROM licenses WHERE used=1 AND (expires_at IS NULL OR expires_at > NOW()) AND banned=0');
        const [[unusedKeys]]  = await db.query('SELECT COUNT(*) AS n FROM licenses WHERE used=0');
        const [[expiredKeys]] = await db.query('SELECT COUNT(*) AS n FROM licenses WHERE expires_at IS NOT NULL AND expires_at <= NOW()');
        const [[totalUsers]]  = await db.query('SELECT COUNT(*) AS n FROM users');
        const [[bannedKeys]]  = await db.query('SELECT COUNT(*) AS n FROM licenses WHERE banned=1');

        // Recent activity (last 24h)
        const [recentLogs] = await db.query(`
            SELECT l.action, l.details, l.ip_address, l.created_at, u.username
            FROM logs l LEFT JOIN users u ON l.user_id=u.id
            WHERE l.created_at >= NOW() - INTERVAL 24 HOUR
            ORDER BY l.created_at DESC LIMIT 20
        `);

        // Keys por plano
        const [byPlan] = await db.query(`
            SELECT p.name, COUNT(l.id) AS total,
                   SUM(CASE WHEN l.used=1 THEN 1 ELSE 0 END) AS used
            FROM licenses l JOIN plans p ON l.plan_id=p.id
            GROUP BY p.id, p.name
        `);

        res.json({
            ok: true,
            stats: {
                total_keys:   totalKeys.n,
                active_keys:  activeKeys.n,
                unused_keys:  unusedKeys.n,
                expired_keys: expiredKeys.n,
                banned_keys:  bannedKeys.n,
                total_users:  totalUsers.n,
            },
            by_plan:      byPlan,
            recent_logs:  recentLogs,
        });
    } catch (e) {
        console.error('[stats]', e);
        res.status(500).json({ ok: false, msg: 'Erro interno' });
    }
});

// ── GET /api/admin/plans ──────────────────────────────────────────
router.get('/plans', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM plans ORDER BY duration ASC');
        res.json({ ok: true, plans: rows });
    } catch (e) {
        res.status(500).json({ ok: false, msg: 'Erro interno' });
    }
});

// ── GET /api/admin/logs ───────────────────────────────────────────
router.get('/logs', async (req, res) => {
    const { limit = 100, offset = 0, action } = req.query;
    let where = '1=1';
    let params = [];
    if (action) { where += ' AND l.action=?'; params.push(action); }

    try {
        const [rows] = await db.query(`
            SELECT l.*, u.username FROM logs l
            LEFT JOIN users u ON l.user_id=u.id
            WHERE ${where}
            ORDER BY l.created_at DESC
            LIMIT ? OFFSET ?
        `, [...params, parseInt(limit), parseInt(offset)]);
        res.json({ ok: true, logs: rows });
    } catch (e) {
        res.status(500).json({ ok: false, msg: 'Erro interno' });
    }
});

module.exports = router;
