const assert = require('node:assert/strict');
const { test } = require('node:test');
const pool = require('../src/config/database.config');
const { getReservationHistory } = require('../src/controllers/reserve.controller');

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

test('returns only the authenticated user reservations with eager-loaded relations', async (t) => {
  const calls = [];
  installQuery(t, async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('FROM reserves')) {
      return [[{
        id: 21,
        user_id: 7,
        reserve_state_id: 1,
        created_at: '2026-11-20 10:00:00',
      }]];
    }
    if (sql.includes('FROM reserve_states')) {
      return [[{ id: 1, description: 'Pendente' }]];
    }
    if (sql.includes('FROM item_reserve')) {
      return [[{ id: 41, reserve_id: 21, item_id: 8, quantity: 2 }]];
    }
    if (sql.includes('FROM kit_reserve')) return [[]];
    if (sql.includes('FROM item WHERE')) {
      return [[{ id: 8, nome: 'Câmara' }]];
    }
    return [[]];
  });
  const response = createResponse();

  await getReservationHistory({ user: { id: 7 } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, 'success');
  assert.equal(response.body.data[0].item_reserves[0].item.nome, 'Câmara');
  assert.equal(response.body.data[0].reserve_state.description, 'Pendente');
  assert.ok(calls.some((call) =>
    call.sql.includes('FROM reserves') && call.params[0] === 7));
});

test('returns an empty history without issuing relation queries', async (t) => {
  let queryCount = 0;
  installQuery(t, async () => {
    queryCount += 1;
    return [[]];
  });
  const response = createResponse();

  await getReservationHistory({ user: { id: 7 } }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { status: 'success', data: [] });
  assert.equal(queryCount, 1);
});
