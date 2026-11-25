const bcrypt = require('bcryptjs');
const { createHash, randomBytes } = require('node:crypto');
const pool = require('../config/database.config');

async function register(request, response) {
  // Valida os campos obrigatórios do registo
  const { name, email, password, phone, student_number: numeroAluno } = request.body ?? {};
  const telefone = phone != null ? String(phone) : '';
  const errors = {
    ...(typeof name !== 'string' || name.trim().length === 0 || name.length > 255
      ? { name: ['O nome é obrigatório.'] } : {}),
    ...(typeof email !== 'string' || email.trim().length === 0
      ? { email: ['O email é obrigatório.'] }
      : (!email.includes('@') || email.length > 255 ? { email: ['Introduz um email válido.'] } : {})),
    ...(typeof password !== 'string' || password.length === 0
      ? { password: ['A password é obrigatória.'] }
      : (password.length < 6 ? { password: ['A password deve ter pelo menos 6 caracteres.'] } : {})),
    ...(telefone.length === 0
      ? { phone: ['O telemóvel é obrigatório.'] }
      : (!/^\d{9}$/.test(telefone) ? { phone: ['O telemóvel deve ter 9 dígitos.'] } : {})),
    ...(numeroAluno != null && String(numeroAluno).length > 20
      ? { student_number: ['The student number may not be greater than 20 characters.'] } : {}),
  };
  if (Object.keys(errors).length > 0) {
    return response.status(422).json({ message: 'The given data was invalid.', errors });
  }

  try {
    // Verifica se o email já está registado
    const [existentes] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (existentes.length > 0) {
      return response.status(422).json({
        message: 'The given data was invalid.',
        errors: { email: ['Este email já se encontra registado.'] },
      });
    }

    // Cria o utilizador e gera o token de acesso
    const passwordHash = await bcrypt.hash(password, 10);
    const [userResult] = await pool.query(
      `INSERT INTO users (name, email, password, phone, n_aluno, user_type_id, user_status_id, image, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 4, 1, 'images/empty.png', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [name, email, passwordHash, telefone, numeroAluno ?? null],
    );
    const [[utilizador]] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [userResult.insertId]);
    const tokenTexto = randomBytes(30).toString('hex');
    const tokenHash = createHash('sha256').update(tokenTexto).digest('hex');
    const [tokenResult] = await pool.query(
      `INSERT INTO personal_access_tokens (tokenable_type, tokenable_id, name, token, abilities, created_at, updated_at)
       VALUES (?, ?, 'auth_token', ?, '["*"]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      ['App\\Models\\User', userResult.insertId, tokenHash],
    );
    const { password: _palavraPasse, ...utilizadorSemPalavraPasse } = utilizador;
    return response.status(201).json({
      status: 'success',
      message: 'Conta criada com sucesso',
      token: `${tokenResult.insertId}|${tokenTexto}`,
      user: utilizadorSemPalavraPasse,
    });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ status: 'error', message: 'Erro ao criar conta.' });
  }
}

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

async function me(request, response) {
  return response.status(200).json(request.user);
}

async function logout(request, response) {
  try {
    // Apaga o token usado no pedido atual
    await pool.query('DELETE FROM personal_access_tokens WHERE id = ?', [request.tokenId]);
    return response.status(200).json({
      status: 'success',
      message: 'Sessão terminada com sucesso.',
    });
  } catch (error) {
    console.error(error);
    return response.status(500).json({
      status: 'error',
      message: 'Erro ao terminar sessão.',
    });
  }
}

module.exports = { register, login, me, logout };
