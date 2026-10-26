const crypto = require('crypto');

/**
 * Gera uma license key no formato FRIS-XXXX-XXXX-XXXX-XXXX
 * Usa crypto.randomBytes para ser criptograficamente segura
 */
function generateKey(prefix = 'FRIS') {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segment = () => {
        let s = '';
        const bytes = crypto.randomBytes(4);
        for (let i = 0; i < 4; i++) {
            s += chars[bytes[i] % chars.length];
        }
        return s;
    };
    return `${prefix}-${segment()}-${segment()}-${segment()}-${segment()}`;
}

/**
 * Calcula a data de expiração com base no plano
 * duration = 0 -> lifetime (null)
 * duration = N -> agora + N dias
 */
function calcExpiry(durationDays) {
    if (!durationDays || durationDays === 0) return null; // lifetime
    const d = new Date();
    d.setDate(d.getDate() + durationDays);
    return d;
}

/**
 * Verifica se uma key está expirada
 */
function isExpired(expiresAt) {
    if (!expiresAt) return false; // lifetime
    return new Date() > new Date(expiresAt);
}

/**
 * Formata tempo restante em string legível
 */
function timeLeft(expiresAt) {
    if (!expiresAt) return 'Lifetime';
    const diff = new Date(expiresAt) - new Date();
    if (diff <= 0) return 'Expirado';
    const days    = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours   = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (days > 0)  return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

module.exports = { generateKey, calcExpiry, isExpired, timeLeft };
