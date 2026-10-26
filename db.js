const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     process.env.DB_PORT     || 3306,
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'frisgui_auth',
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0,
    timezone: 'Z',
});

// Test connection on startup
pool.getConnection()
    .then(conn => {
        console.log('[DB] MySQL conectado com sucesso');
        conn.release();
    })
    .catch(err => {
        console.error('[DB] Erro ao conectar:', err.message);
        process.exit(1);
    });

module.exports = pool;
