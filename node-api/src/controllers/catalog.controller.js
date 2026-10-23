const pool = require('../config/database.config');

function analisarData(valor) {
  if (!valor) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw new Error(`Invalid date: ${valor}`);
  const data = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== valor) {
    throw new Error(`Invalid date: ${valor}`);
  }
  return valor;
}

function adicionarDia(valor) {
  const data = new Date(`${valor}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + 1);
  return data.toISOString().slice(0, 10);
}

function reservaAtivaNaData(reserva, data) {
  const dataInicio = reserva.start_date.slice(0, 10);
  const dataFim = reserva.end_date.slice(0, 10);
  if (data < dataInicio || data > dataFim) return false;
  const diaSemana = new Date(`${data}T00:00:00Z`).getUTCDay();
  return reserva.ciclica_id === null || Number(reserva.ciclica_id) === 1 ||
    diaSemana === Number(reserva.ciclica_id) - 2;
}

async function calcularStockMinimo(tabela, colunaFk, entidadeId, totalFisico, dataInicio, dataFim) {
  const [reservasOcupantes] = await pool.query(
    `SELECT r.start_date, r.end_date, pivot.quantity, r.ciclica_id
       FROM \`${tabela}\` pivot INNER JOIN reserves r ON pivot.reserve_id = r.id
      WHERE pivot.\`${colunaFk}\` = ? AND r.reserve_state_id IN (1, 2, 4, 7)
        AND r.start_date <= ? AND r.end_date >= ?`,
    [entidadeId, dataFim, dataInicio],
  );
  let minimoDisponivel = totalFisico;
  for (let data = dataInicio; data <= dataFim; data = adicionarDia(data)) {
    const ocupadosHoje = reservasOcupantes.reduce((total, reserva) =>
      total + (reservaAtivaNaData(reserva, data) ? Number(reserva.quantity) : 0), 0);
    minimoDisponivel = Math.min(minimoDisponivel, totalFisico - ocupadosHoje);
  }
  return Math.max(0, minimoDisponivel);
}

async function obterKits(pesquisa) {
  const parametros = [1];
  const filtro = pesquisa ? ' AND k.name LIKE ?' : '';
  if (pesquisa) parametros.push(`%${pesquisa}%`);
  const [linhas] = await pool.query(
    `SELECT k.*, COUNT(ku.id) AS kit_unities_count FROM kits k
       INNER JOIN kit_unity ku ON ku.kit_id = k.id AND ku.kit_unity_state_id = ?
      WHERE 1 = 1${filtro} GROUP BY k.id`, parametros);
  return linhas;
}

async function obterItens(pesquisa, categoriaId) {
  const parametros = [1];
  const filtros = [];
  if (pesquisa) {
    filtros.push('(i.nome LIKE ? OR i.model LIKE ?)');
    parametros.push(`%${pesquisa}%`, `%${pesquisa}%`);
  }
  if (categoriaId !== 'Todos') {
    filtros.push('i.categoria_id = ?');
    parametros.push(categoriaId);
  }
  const [linhas] = await pool.query(
    `SELECT i.*, COUNT(iu.id) AS item_unities_count FROM item i
       INNER JOIN item_unity iu ON iu.item_id = i.id AND iu.item_unity_state_id = ?
      ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''} GROUP BY i.id`, parametros);
  return linhas;
}

async function aplicarStock(linhas, tabela, colunaFk, dataInicio, dataFim, campoContagem) {
  return Promise.all(linhas.map(async (linha) => {
    const totalFisico = Number(linha[campoContagem]);
    const disponivel = dataInicio && dataFim
      ? await calcularStockMinimo(tabela, colunaFk, linha.id, totalFisico, dataInicio, dataFim)
      : totalFisico;
    return { ...linha, item_unities_count: disponivel };
  }));
}

async function catalogo(request, response) {
  try {
    const consulta = request.query;
    const pesquisa = consulta.search ?? '';
    const categoriaId = consulta.categoria_id ?? 'Todos';
    const pagina = Math.max(1, Number(consulta.page ?? 1));
    const dataInicio = analisarData(consulta.start_date);
    const dataFim = analisarData(consulta.end_date);
    if ((dataInicio === null) !== (dataFim === null) ||
        (dataInicio && dataFim && dataInicio > dataFim)) {
      throw new Error('Invalid date range');
    }

    let kitsDestaque = [];
    let itensLista = [];
    let paginacao = [];
    if (categoriaId === 'Kits') {
      const todosKits = await obterKits(pesquisa);
      const kitsPagina = todosKits.slice((pagina - 1) * 10, pagina * 10).map((kit) => ({
        ...kit,
        nome: kit.name,
        model: kit.description,
      }));
      itensLista = await aplicarStock(kitsPagina, 'kit_reserve', 'kit_id',
        dataInicio, dataFim, 'kit_unities_count');
      paginacao = {
        pagina_atual: pagina,
        ultima_pagina: Math.max(1, Math.ceil(todosKits.length / 10)),
        tem_mais: pagina * 10 < todosKits.length,
      };
    } else {
      if (pagina === 1 && categoriaId === 'Todos' && !pesquisa) {
        kitsDestaque = await aplicarStock(await obterKits(''), 'kit_reserve', 'kit_id',
          dataInicio, dataFim, 'kit_unities_count');
      }
      const todosItens = await obterItens(pesquisa, categoriaId);
      itensLista = await aplicarStock(
        todosItens.slice((pagina - 1) * 10, pagina * 10),
        'item_reserve',
        'item_id',
        dataInicio,
        dataFim,
        'item_unities_count',
      );
      paginacao = {
        pagina_atual: pagina,
        ultima_pagina: Math.max(1, Math.ceil(todosItens.length / 10)),
        tem_mais: pagina * 10 < todosItens.length,
      };
    }

    const categorias = pagina === 1
      ? (await pool.query('SELECT id, description FROM item_categories'))[0]
      : [];
    return response.status(200).json({
      status: 'success',
      data: { categorias, kits: kitsDestaque, itens: itensLista, paginacao },
    });
  } catch (error) {
    console.error(error);
    return response.status(500).json({
      status: 'error',
      message: `Erro ao carregar o catálogo: ${error.message}`,
    });
  }
}

async function detalheItem(request, response) {
  try {
    const id = request.params.id;
    const consulta = request.query;
    const dataInicio = analisarData(consulta.start_date);
    const dataFim = analisarData(consulta.end_date);
    const tipo = consulta.tipo;

    if (dataInicio && dataFim && dataInicio > dataFim) {
      throw new Error('Invalid date range');
    }

    if (tipo !== 'kit') {
      const [itens] = await pool.query(
        `SELECT i.*, c.description AS categoria_descricao, COUNT(iu.id) AS item_unities_count
           FROM item i
           LEFT JOIN item_categories c ON c.id = i.categoria_id
           LEFT JOIN item_unity iu ON iu.item_id = i.id AND iu.item_unity_state_id = ?
          WHERE i.id = ?
          GROUP BY i.id, c.description`,
        [1, id],
      );
      const item = itens[0];

      if (item) {
        const totalFisico = dataInicio && dataFim
          ? await calcularStockMinimo(
            'item_reserve',
            'item_id',
            item.id,
            Number(item.item_unities_count),
            dataInicio,
            dataFim,
          )
          : Number(item.item_unities_count);

        return response.status(200).json({
          status: 'success',
          data: {
            id: item.id,
            nome: item.nome,
            model: item.model,
            categoria: item.categoria_descricao ?? 'Geral',
            observacao: item.observation ?? 'Nenhuma observação',
            acessorios: item.acessorio ?? 'Nenhum acessório listado',
            quantidade: totalFisico,
            price_day: item.price_day ?? item.preco ?? 'Não definido',
            image: item.image,
            is_kit: false,
          },
        });
      }
    }

    if (tipo === 'kit' || tipo === undefined) {
      const [kits] = await pool.query(
        `SELECT k.*, COUNT(ku.id) AS kit_unities_count
           FROM kits k
           LEFT JOIN kit_unity ku ON ku.kit_id = k.id AND ku.kit_unity_state_id = ?
          WHERE k.id = ?
          GROUP BY k.id`,
        [1, id],
      );
      const kit = kits[0];

      if (kit) {
        const totalFisico = dataInicio && dataFim
          ? await calcularStockMinimo(
            'kit_reserve',
            'kit_id',
            kit.id,
            Number(kit.kit_unities_count),
            dataInicio,
            dataFim,
          )
          : Number(kit.kit_unities_count);

        return response.status(200).json({
          status: 'success',
          data: {
            id: kit.id,
            nome: kit.name,
            model: null,
            categoria: 'Kit Completo',
            observacao: 'Conjunto de Equipamentos',
            acessorios: kit.description ?? 'Sem descrição disponível',
            quantidade: totalFisico,
            price_day: kit.price_day ?? kit.price ?? 'Não definido',
            image: kit.image,
            is_kit: true,
          },
        });
      }
    }

    return response.status(404).json({
      status: 'error',
      message: 'Equipamento ou Kit não encontrado.',
    });
  } catch (error) {
    console.error(error);
    return response.status(500).json({
      status: 'error',
      message: `Erro ao carregar detalhes: ${error.message}`,
    });
  }
}

module.exports = { catalogo, detalheItem };
