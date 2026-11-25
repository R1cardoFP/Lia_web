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

module.exports = { estatisticas };
