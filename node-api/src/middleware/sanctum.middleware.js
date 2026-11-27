const { createHash } = require('node:crypto');
const pool = require('../config/database.config');
const { publicUser } = require('../utils/public-user');

async function requireSanctumToken(request, response, next) {
  const value = request.headers.authorization ?? '';
  const match = /^Bearer\s+(\d+)\|(.+)$/.exec(value);
  if (!match) return response.status(401).json({ message: 'Unauthenticated.' });

  // Valida o hash SHA-256 do token na base de dados
  const token = createHash('sha256').update(match[2]).digest('hex');
  const [rows] = await pool.query(
    `SELECT id, tokenable_id FROM personal_access_tokens WHERE id = ? AND token = ?`,
    [match[1], token],
  );
  if (rows.length === 0) return response.status(401).json({ message: 'Unauthenticated.' });

  // Carrega os dados do utilizador autenticado sem a password
  const [utilizadores] = await pool.query(
    'SELECT * FROM users WHERE id = ? LIMIT 1',
    [rows[0].tokenable_id],
  );
  if (utilizadores.length === 0) return response.status(401).json({ message: 'Unauthenticated.' });

  request.tokenId = rows[0].id;
  request.user = publicUser(utilizadores[0]);
  next();
}

module.exports = { requireSanctumToken };
