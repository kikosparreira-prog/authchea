require('dotenv').config();
const express     = require('express');
const cors        = require('cors');
const rateLimit   = require('express-rate-limit');
const path        = require('path');

const authRoutes     = require('./routes/auth');
const licenseRoutes  = require('./routes/licenses');
const adminRoutes    = require('./routes/admin');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trust proxy (se estiveres atrás de nginx)
app.set('trust proxy', 1);

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 100,
    message: { ok: false, msg: 'Demasiados pedidos. Tenta mais tarde.' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { ok: false, msg: 'Demasiadas tentativas de login.' }
});

app.use('/api/', limiter);
app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);

// ── Serve painel admin (frontend) ─────────────────────────────────
app.use(express.static(path.join(__dirname, '../panel/public')));

// ── API Routes ─────────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/licenses', licenseRoutes);
app.use('/api/admin',    adminRoutes);

// ── Health check ──────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ ok: true, app: process.env.APP_NAME, version: process.env.APP_VERSION });
});

// ── 404 ───────────────────────────────────────────────────────────
app.use('/api/*', (req, res) => {
    res.status(404).json({ ok: false, msg: 'Rota não encontrada' });
});

// ── Serve SPA para tudo o resto ───────────────────────────────────
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../panel/public/index.html'));
});

// ── Start ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`[Server] FrisGui Auth rodando em http://localhost:${PORT}`);
    console.log(`[Server] Painel admin em http://localhost:${PORT}/admin`);
});
