const pool = require('../config/database.config');

async function listarDisponibilidade(_request, response) {
  try {
    // Busca apenas horários de hoje em diante e ainda não expirados
    const [horarios] = await pool.query(
      `SELECT data, descricao
       FROM disponibilidade
       WHERE DATE(data) >= CURDATE()
         AND (data_expiracao IS NULL OR data_expiracao >= NOW())
       ORDER BY data ASC`,
    );

    // Formata a data no formato YYYY-MM-DD
    const dados = horarios.map((linha) => ({
      data: String(linha.data).slice(0, 10),
      descricao: linha.descricao,
    }));

    return response.status(200).json({
      status: 'success',
      data: dados,
    });
  } catch (error) {
    console.error(error);
    return response.status(500).json({
      status: 'error',
      message: `Erro ao carregar disponibilidade: ${error.message}`,
    });
  }
}

module.exports = { listarDisponibilidade };
