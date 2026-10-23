const { createHash } = require('node:crypto');
const pool = require('../config/database.config');

async function requireSanctumToken(request, response, next) {
  const value = request.headers.authorization ?? '';
  const match = /^Bearer\s+(\d+)\|(.+)$/.exec(value);
  if (!match) return response.status(401).json({ message: 'Unauthenticated.' });

  const token = createHash('sha256').update(match[2]).digest('hex');
  const [rows] = await pool.query(
    `SELECT id FROM personal_access_tokens WHERE id = ? AND token = ?`,
    [match[1], token],
  );
  if (rows.length === 0) return response.status(401).json({ message: 'Unauthenticated.' });
  next();
}

module.exports = { requireSanctumToken };
