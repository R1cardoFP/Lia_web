const pool = require('../config/database.config');

async function historicoReservas(request, response) {
  try {
    // Busca as reservas do utilizador autenticado com o respetivo estado
    const [linhas] = await pool.query(
      `SELECT r.*, rs.description AS estado_descricao
       FROM reserves r
       LEFT JOIN reserve_states rs ON rs.id = r.reserve_state_id
       WHERE r.user_id = ?
       ORDER BY r.created_at DESC`,
      [request.user.id],
    );

    const reservas = linhas.map(({ estado_descricao: descricao, ...r }) => ({
      ...r,
      reserve_state: { id: r.reserve_state_id, description: descricao, name: descricao },
    }));

    return response.status(200).json({ status: 'success', data: reservas });
  } catch (error) {
    console.error(error);
    return response.status(500).json({
      status: 'error',
      message: `Erro ao carregar o histórico: ${error.message}`,
    });
  }
}

module.exports = { historicoReservas };
