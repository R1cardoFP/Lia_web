const pool = require('../config/database.config');

async function listarCentrosCusto(_request, response) {
  try {
    const [centros] = await pool.query(
      'SELECT id, name FROM cost_centers',
    );

    return response.status(200).json({
      status: 'success',
      data: centros,
    });
  } catch (error) {
    console.error(error);
    return response.status(500).json({
      status: 'error',
      message: 'Erro ao carregar centros de custo.',
    });
  }
}

module.exports = { listarCentrosCusto };
