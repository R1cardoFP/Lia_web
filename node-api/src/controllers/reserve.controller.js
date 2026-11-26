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

async function cancelarReserva(request, response) {
  try {
    // Procura a reserva pelo ID enviado na rota
    const [[reserva]] = await pool.query('SELECT * FROM reserves WHERE id = ? LIMIT 1', [request.params.id]);
    if (!reserva) {
      return response.status(404).json({ status: 'error', message: 'Reserva não encontrada.' });
    }

    // Garante que o utilizador só pode cancelar as suas próprias reservas
    if (Number(reserva.user_id) !== Number(request.user.id)) {
      return response.status(403).json({
        status: 'error',
        message: 'Não tens permissão para cancelar esta reserva.',
      });
    }

    // Só permite cancelar reservas no estado Pendente (1)
    if (Number(reserva.reserve_state_id) !== 1) {
      return response.status(400).json({
        status: 'error',
        message: 'Apenas reservas pendentes podem ser canceladas.',
      });
    }

    await pool.query(
      'UPDATE reserves SET reserve_state_id = 10, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [request.params.id],
    );

    return response.status(200).json({
      status: 'success',
      message: 'A reserva foi cancelada com sucesso.',
    });
  } catch (error) {
    console.error(error);
    return response.status(500).json({
      status: 'error',
      message: `Erro ao tentar cancelar a reserva: ${error.message}`,
    });
  }
}

module.exports = { historicoReservas, cancelarReserva };
