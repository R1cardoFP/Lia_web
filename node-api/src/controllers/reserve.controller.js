const pool = require('../config/database.config');

const ESTADOS_RESERVA_BLOQUEANTES = [1, 2, 4, 7];

function isInteger(value) {
  return (typeof value === 'number' && Number.isInteger(value)) ||
    (typeof value === 'string' && /^-?\d+$/.test(value));
}

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : value;
}

function addDay(value) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function buildReservationDates(startDate, endDate, cyclicId) {
  const dates = [];
  for (let date = startDate; date <= endDate; date = addDay(date)) {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (cyclicId === 1 || weekday === cyclicId - 2) dates.push({ date, weekday });
  }
  return dates;
}

function normalizeLines(value, field, errors) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    errors[field] = ['The field must be an array.'];
    return [];
  }

  const lines = [];
  value.forEach((line, index) => {
    if (!line || typeof line !== 'object' || Array.isArray(line)) {
      errors[`${field}.${index}.id`] = ['The selected item is invalid.'];
      return;
    }

    const id = line.id;
    const quantity = line.quantity;
    if (!isInteger(id)) errors[`${field}.${index}.id`] = ['The ID must be an integer.'];
    if (!isInteger(quantity) || Number(quantity) < 1) {
      errors[`${field}.${index}.quantity`] = ['The quantity must be an integer of at least 1.'];
    }
    if (isInteger(id) && isInteger(quantity) && Number(quantity) >= 1) {
      lines.push({ id: Number(id), quantity: Number(quantity) });
    }
  });
  return lines;
}

function aggregateLines(lines) {
  const byId = new Map();
  for (const line of lines) {
    byId.set(line.id, (byId.get(line.id) ?? 0) + line.quantity);
  }
  return [...byId].map(([id, quantity]) => ({ id, quantity }));
}

function validateRequest(body) {
  const errors = {};
  const description = body.description;
  const startDate = parseDate(body.start_date);
  const endDate = parseDate(body.end_date);
  const costCenterId = body.cost_center_id;
  const cyclicId = body.ciclica_id;

  if (typeof description !== 'string' || description.trim().length === 0) {
    errors.description = ['The description field is required and must be a string.'];
  }
  if (!startDate) errors.start_date = ['The start date is not a valid date.'];
  if (!endDate) errors.end_date = ['The end date is not a valid date.'];
  if (startDate && endDate && endDate < startDate) {
    errors.end_date = ['The end date must be a date after or equal to start date.'];
  }
  if (!isInteger(costCenterId)) errors.cost_center_id = ['The cost center ID must be an integer.'];
  if (!isInteger(cyclicId)) errors.ciclica_id = ['The cyclic ID must be an integer.'];

  const items = normalizeLines(body.items, 'items', errors);
  const kits = normalizeLines(body.kits, 'kits', errors);

  return {
    errors,
    description,
    startDate,
    endDate,
    costCenterId: Number(costCenterId),
    cyclicId: Number(cyclicId),
    items: aggregateLines(items),
    kits: aggregateLines(kits),
  };
}

function activeOnDate(reservation, date, weekday) {
  const startDate = String(reservation.start_date).slice(0, 10);
  const endDate = String(reservation.end_date).slice(0, 10);
  if (date < startDate || date > endDate) return false;
  return reservation.ciclica_id == null || Number(reservation.ciclica_id) === 1 ||
    weekday === Number(reservation.ciclica_id) - 2;
}

async function getStockAndReservations(connection, entity, entityId, startDate, endDate) {
  const [availableUnits] = await connection.query(
    `SELECT unity.id
       FROM \`${entity.unitTable}\` unity
      WHERE unity.\`${entity.foreignKey}\` = ? AND unity.\`${entity.stateColumn}\` = 1
      FOR UPDATE`,
    [entityId],
  );
  const [reservations] = await connection.query(
    `SELECT r.start_date, r.end_date, pivot.quantity, r.ciclica_id
       FROM \`${entity.pivotTable}\` pivot
       INNER JOIN reserves r ON pivot.reserve_id = r.id
      WHERE pivot.\`${entity.foreignKey}\` = ?
        AND r.reserve_state_id IN (?, ?, ?, ?)
        AND r.start_date <= ? AND r.end_date >= ?`,
    [entityId, ...ESTADOS_RESERVA_BLOQUEANTES, endDate, startDate],
  );
  return { totalStock: availableUnits.length, reservations };
}

async function checkRequestedStock(connection, lines, entity, dates, startDate, endDate, typeLabel) {
  let totalCost = 0;
  for (const line of lines) {
    const [products] = await connection.query(
      `SELECT id, \`${entity.nameColumn}\` AS name, price_day
         FROM \`${entity.table}\`
        WHERE id = ? LIMIT 1`,
      [line.id],
    );
    const product = products[0];
    if (!product) {
      return {
        error: {
          status: 404,
          message: `${typeLabel} ID ${line.id} não encontrado.`,
        },
      };
    }

    const { totalStock, reservations } = await getStockAndReservations(
      connection, entity, line.id, startDate, endDate,
    );
    let minimumAvailable = totalStock;
    for (const { date, weekday } of dates) {
      const occupied = reservations.reduce((total, reservation) =>
        total + (activeOnDate(reservation, date, weekday) ? Number(reservation.quantity) : 0), 0);
      minimumAvailable = Math.min(minimumAvailable, totalStock - occupied);
    }

    if (line.quantity > minimumAvailable) {
      const displayName = typeLabel === 'Item' ? 'O item' : 'O kit';
      return {
        error: {
          status: 422,
          message: `${displayName} '${product.name}' não tem stock suficiente. Máximo disponível: ${minimumAvailable}`,
        },
      };
    }
    if (product.price_day == null) {
      const displayName = typeLabel === 'Item' ? 'O item' : 'O kit';
      return {
        error: {
          status: 422,
          message: `${displayName} '${product.name}' não tem um preço diário definido no sistema. Contacte o administrador.`,
        },
      };
    }
    totalCost += Number(product.price_day) * dates.length * line.quantity;
  }
  return { totalCost };
}

async function createReservation(request, response) {
  const body = request.body ?? {};
  const validated = validateRequest(body);
  if (Object.keys(validated.errors).length > 0) {
    return response.status(422).json({
      message: 'The given data was invalid.',
      errors: validated.errors,
    });
  }

  if (Number(request.user.user_type_id) === 6) {
    return response.status(403).json({
      status: 'error',
      message: 'Atualize o seu perfil antes de criar uma reserva!',
    });
  }
  if (validated.items.length === 0 && validated.kits.length === 0) {
    return response.status(422).json({
      status: 'error',
      message: 'Adicione pelo menos um kit ou um item para poder concluir!',
    });
  }

  const dates = buildReservationDates(
    validated.startDate,
    validated.endDate,
    validated.cyclicId,
  );
  if (validated.cyclicId !== 1 && dates.length === 0) {
    return response.status(422).json({
      status: 'error',
      message: 'O dia de semana selecionado não existe dentro do período de datas fornecido.',
    });
  }

  const itemEntity = {
    table: 'item',
    nameColumn: 'nome',
    unitTable: 'item_unity',
    stateColumn: 'item_unity_state_id',
    pivotTable: 'item_reserve',
    foreignKey: 'item_id',
  };
  const kitEntity = {
    table: 'kits',
    nameColumn: 'name',
    unitTable: 'kit_unity',
    stateColumn: 'kit_unity_state_id',
    pivotTable: 'kit_reserve',
    foreignKey: 'kit_id',
  };

  let connection;
  let transactionStarted = false;
  async function reject(status, body) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(rollbackError);
      }
      transactionStarted = false;
    }
    return response.status(status).json(body);
  }

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const itemCheck = await checkRequestedStock(
      connection, validated.items, itemEntity, dates,
      validated.startDate, validated.endDate, 'Item',
    );
    if (itemCheck.error) {
      return await reject(itemCheck.error.status, {
        status: 'error',
        message: itemCheck.error.message,
      });
    }
    const kitCheck = await checkRequestedStock(
      connection, validated.kits, kitEntity, dates,
      validated.startDate, validated.endDate, 'Kit',
    );
    if (kitCheck.error) {
      return await reject(kitCheck.error.status, {
        status: 'error',
        message: kitCheck.error.message,
      });
    }

    const estimatedCost = itemCheck.totalCost + kitCheck.totalCost;
    const [reserveResult] = await connection.query(
      `INSERT INTO reserves
        (description, cost_center_id, ciclica_id, user_id, start_date, end_date,
         cost, estimated_cost, reserve_state_id, delivery_date, return_date,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, 1, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        validated.description,
        validated.costCenterId,
        validated.cyclicId,
        request.user.id,
        validated.startDate,
        validated.endDate,
        estimatedCost,
      ],
    );

    for (const kit of validated.kits) {
      await connection.query(
        'INSERT INTO kit_reserve (reserve_id, kit_id, quantity) VALUES (?, ?, ?)',
        [reserveResult.insertId, kit.id, kit.quantity],
      );
    }
    for (const item of validated.items) {
      await connection.query(
        'INSERT INTO item_reserve (reserve_id, item_id, quantity) VALUES (?, ?, ?)',
        [reserveResult.insertId, item.id, item.quantity],
      );
    }
    await connection.commit();
    transactionStarted = false;
    return response.status(201).json({
      status: 'success',
      message: 'Reserva efetuada com sucesso!',
    });
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(rollbackError);
      }
    }
    console.error(error);
    return response.status(500).json({
      status: 'error',
      message: `Erro ao salvar reserva: ${error.message}`,
    });
  } finally {
    if (connection) connection.release();
  }
}

module.exports = { createReservation };
