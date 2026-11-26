const assert = require('node:assert/strict');
const { test } = require('node:test');
const pool = require('../src/config/database.config');
const { getReservationDetails } = require('../src/controllers/reserve.controller');

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function installQuery(t, query) {
  const originalQuery = pool.query;
  pool.query = query;
  t.after(() => {
    pool.query = originalQuery;
  });
}

test('returns reservation details and associated items and kits', async (t) => {
  const calls = [];
  installQuery(t, async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('FROM reserves r')) {
      return [[{
        id: 21,
        reserve_state_id: 1,
        description: 'Filmagem',
        start_date: '2026-11-27',
        end_date: '2026-11-27',
        estimated_cost: '20.00',
        is_paid: 0,
        ciclica_id: 1,
        estado: 'Pendente',
      }]];
    }
    if (sql.includes('FROM item_reserve ir')) {
      return [[{
        id: 8,
        nome: 'Câmara',
        model: 'X1',
        image: null,
        price_day: '10.00',
        quantity: 2,
      }]];
    }
    return [[{
      id: 5,
      name: 'Kit vídeo',
      description: 'Conjunto de vídeo',
      image: null,
      price_day: null,
      quantity: 1,
    }]];
  });
  const response = createResponse();

  await getReservationDetails({
    params: { id: '21' },
    user: { id: 7 },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.estado, 'Pendente');
  assert.equal(response.body.data.itens[0].quantidade, 2);
  assert.equal(response.body.data.kits[0].price_day, 0);
  assert.ok(calls[0].sql.includes('r.user_id = ?'));
  assert.deepEqual(calls[0].params, ['21', 7]);
});

test('does not return another user reservation', async (t) => {
  installQuery(t, async () => [[]]);
  const response = createResponse();

  await getReservationDetails({
    params: { id: '21' },
    user: { id: 8 },
  }, response);

  assert.equal(response.statusCode, 404);
  assert.match(response.body.message, /Reserva não encontrada/);
});
