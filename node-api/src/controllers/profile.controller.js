const pool = require('../config/database.config');

async function estatisticas(request, response) {
  try {
    const userId = request.user.id;

    // Conta o total de reservas e as reservas ativas do utilizador
    const [[contadores]] = await pool.query(
      `SELECT COUNT(*) AS reservas,
              COALESCE(SUM(reserve_state_id IN (1, 2, 4, 7)), 0) AS ativas
       FROM reserves
       WHERE user_id = ?`,
      [userId],
    );

    // Soma as quantidades de itens e kits associados às reservas do utilizador
    const [[itens]] = await pool.query(
      `SELECT COALESCE(SUM(ir.quantity), 0) AS total
       FROM item_reserve ir
       INNER JOIN reserves r ON r.id = ir.reserve_id
       WHERE r.user_id = ?`,
      [userId],
    );
    const [[kits]] = await pool.query(
      `SELECT COALESCE(SUM(kr.quantity), 0) AS total
       FROM kit_reserve kr
       INNER JOIN reserves r ON r.id = kr.reserve_id
       WHERE r.user_id = ?`,
      [userId],
    );

    return response.status(200).json({
      status: 'success',
      data: {
        reservas: Number(contadores.reservas ?? 0),
        ativas: Number(contadores.ativas ?? 0),
        itens_usados: Number(itens.total ?? 0) + Number(kits.total ?? 0),
      },
    });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ status: 'error', message: error.message });
  }
}

async function atualizarPerfil(request, response) {
  try {
    const user = request.user;
    const { name, phone, curso, n_aluno: numeroAluno } = request.body ?? {};

    // Se o telemóvel for enviado, valida se tem exatamente 9 dígitos numéricos
    if (phone !== undefined) {
      const telefone = String(phone).trim();
      if (!/^\d{9}$/.test(telefone)) {
        return response.status(422).json({
          status: 'error',
          message: 'O número de telemóvel deve conter exatamente 9 dígitos.',
        });
      }
    }

    // Atualiza os dados mantendo os valores atuais quando o campo não é enviado
    await pool.query(
      `UPDATE users
       SET name = ?, phone = ?, curso = ?, n_aluno = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        name ?? user.name,
        phone !== undefined ? String(phone).trim() : user.phone,
        curso ?? user.curso,
        numeroAluno ?? user.n_aluno,
        user.id,
      ],
    );

    // Obtém o utilizador atualizado sem a coluna password
    const [[utilizador]] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [user.id]);
    const { password: _palavraPasse, ...utilizadorSemPalavraPasse } = utilizador;

    return response.status(200).json({
      status: 'success',
      message: 'Perfil atualizado com sucesso!',
      user: utilizadorSemPalavraPasse,
    });
  } catch (error) {
    console.error(error);
    return response.status(500).json({
      status: 'error',
      message: `Erro ao atualizar perfil: ${error.message}`,
    });
  }
}

module.exports = { estatisticas, atualizarPerfil };
