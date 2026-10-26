-- FrisGui Auth System — Schema MySQL
-- Executa: mysql -u root -p < schema.sql

CREATE DATABASE IF NOT EXISTS frisgui_auth CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE frisgui_auth;

-- ── Utilizadores ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(32)  NOT NULL UNIQUE,
    email         VARCHAR(128) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          ENUM('user','admin','reseller') DEFAULT 'user',
    hwid          VARCHAR(255) DEFAULT NULL,
    hwid_reset_at DATETIME    DEFAULT NULL,
    banned        TINYINT(1)  DEFAULT 0,
    ban_reason    VARCHAR(255) DEFAULT NULL,
    created_at    DATETIME    DEFAULT CURRENT_TIMESTAMP,
    last_login    DATETIME    DEFAULT NULL
);

-- ── Planos / Produtos ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(64)  NOT NULL,         -- 'Diário', 'Semanal', etc.
    duration    INT          NOT NULL,          -- dias (0 = lifetime)
    price       DECIMAL(10,2) DEFAULT 0.00,
    product     VARCHAR(64)  DEFAULT 'all',    -- 'fivem','fortnite','all'
    active      TINYINT(1)  DEFAULT 1,
    created_at  DATETIME    DEFAULT CURRENT_TIMESTAMP
);

-- Planos padrão
INSERT IGNORE INTO plans (id, name, duration, price, product) VALUES
(1, 'Diário',   1,   4.99,  'all'),
(2, 'Semanal',  7,   14.99, 'all'),
(3, 'Mensal',   30,  39.99, 'all'),
(4, 'Lifetime', 0,   99.99, 'all'),
(5, 'Diário FiveM',   1,  3.99,  'fivem'),
(6, 'Semanal FiveM',  7,  9.99,  'fivem'),
(7, 'Mensal FiveM',   30, 24.99, 'fivem'),
(8, 'Diário Fortnite',1,  3.99,  'fortnite'),
(9, 'Semanal Fortnite',7, 9.99,  'fortnite');

-- ── Licenças / Keys ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS licenses (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    license_key  VARCHAR(64)  NOT NULL UNIQUE,  -- FRIS-XXXX-XXXX-XXXX-XXXX
    plan_id      INT          NOT NULL,
    user_id      INT          DEFAULT NULL,       -- NULL = não ativada ainda
    hwid         VARCHAR(255) DEFAULT NULL,
    ip_address   VARCHAR(64)  DEFAULT NULL,
    activated_at DATETIME    DEFAULT NULL,
    expires_at   DATETIME    DEFAULT NULL,        -- NULL = lifetime
    paused_at    DATETIME    DEFAULT NULL,
    paused_days  INT          DEFAULT 0,
    used         TINYINT(1)  DEFAULT 0,
    banned       TINYINT(1)  DEFAULT 0,
    ban_reason   VARCHAR(255) DEFAULT NULL,
    created_by   INT          DEFAULT NULL,       -- admin/reseller user_id
    created_at   DATETIME    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id)    REFERENCES plans(id),
    FOREIGN KEY (user_id)    REFERENCES users(id)
);

-- ── Sessões ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    user_id      INT          NOT NULL,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    hwid         VARCHAR(255) DEFAULT NULL,
    ip_address   VARCHAR(64)  DEFAULT NULL,
    created_at   DATETIME    DEFAULT CURRENT_TIMESTAMP,
    expires_at   DATETIME    NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Logs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS logs (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT          DEFAULT NULL,
    action     VARCHAR(64)  NOT NULL,   -- 'login','activate','validate','ban'
    details    TEXT         DEFAULT NULL,
    ip_address VARCHAR(64)  DEFAULT NULL,
    created_at DATETIME    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ── Admin padrão (senha: admin123 — MUDA ISTO!) ───────────────────
INSERT IGNORE INTO users (id, username, email, password_hash, role)
VALUES (1, 'admin', 'admin@frisgui.com',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lh8.',
    'admin');

-- Índices para performance
CREATE INDEX idx_license_key   ON licenses(license_key);
CREATE INDEX idx_license_user  ON licenses(user_id);
CREATE INDEX idx_license_hwid  ON licenses(hwid);
CREATE INDEX idx_session_token ON sessions(session_token);
CREATE INDEX idx_logs_user     ON logs(user_id);
CREATE INDEX idx_logs_action   ON logs(action);
