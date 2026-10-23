const bcrypt = require('bcryptjs');
const { createHash, randomBytes } = require('node:crypto');
const pool = require('../config/database.config');

async function login(request, response) {
  const email = request.body?.email;
  const palavraPasse = request.body?.password;
  if (typeof email !== 'string' || email.length === 0 || !email.includes('@') ||
      typeof palavraPasse !== 'string' || palavraPasse.length === 0) {
    return response.status(422).json({
      message: 'The given data was invalid.',
      errors: {
        ...(typeof email !== 'string' || email.length === 0 || !email.includes('@')
          ? { email: ['The email field is required and must be a valid email address.'] } : {}),
        ...(typeof palavraPasse !== 'string' || palavraPasse.length === 0
          ? { password: ['The password field is required.'] } : {}),
      },
    });
  }

  try {
    const [utilizadores] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
    const utilizador = utilizadores[0];
    if (!utilizador || !(await bcrypt.compare(palavraPasse, utilizador.password))) {
      return response.status(401).json({ status: 'error', message: 'Email ou password incorretos.' });
    }

    await pool.query(
      'DELETE FROM personal_access_tokens WHERE tokenable_type = ? AND tokenable_id = ?',
      ['App\\Models\\User', utilizador.id],
    );
    const tokenTexto = randomBytes(30).toString('hex');
    const tokenHash = createHash('sha256').update(tokenTexto).digest('hex');
    const [tokenResult] = await pool.query(
      `INSERT INTO personal_access_tokens
        (tokenable_type, tokenable_id, name, token, abilities, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      ['App\\Models\\User', utilizador.id, 'LIA_Mobile_App', tokenHash, '["*"]'],
    );
    const { password: _palavraPasse, ...utilizadorSemPalavraPasse } = utilizador;
    return response.status(200).json({
      status: 'success',
      message: 'Login efetuado com sucesso.',
      token: `${tokenResult.insertId}|${tokenTexto}`,
      user: utilizadorSemPalavraPasse,
    });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ status: 'error', message: 'Erro ao tentar efetuar login.' });
  }
}

module.exports = { login };
