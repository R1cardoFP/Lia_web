const assert = require('node:assert/strict');
const { test } = require('node:test');
const pool = require('../src/config/database.config');
const { createReservation } = require('../src/controllers/reserve.controller');

const requestBody = {
  description: 'Reserva de teste',
  start_date: '2026-11-27',
  end_date: '2026-11-27',
  cost_center_id: 1,
  ciclica_id: 1,
  items: [{ id: 8, quantity: 2 }],
};

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

function installConnection(t, options = {}) {
  const calls = [];
  const connection = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('AS name')) {
        return [[{ id: 8, name: 'Câmara', price_day: '10.00' }]];
      }
      if (sql.includes('SELECT unity.id')) {
        return [Array.from({ length: options.stock ?? 5 }, (_, id) => ({ id }))];
      }
      if (sql.includes('SELECT r.start_date')) return [[]];
      if (sql.includes('INSERT INTO reserves')) return [{ insertId: 321 }];
      return [{}];
    },
    async beginTransaction() {
      calls.push({ sql: 'BEGIN' });
    },
    async commit() {
      calls.push({ sql: 'COMMIT' });
    },
    async rollback() {
      calls.push({ sql: 'ROLLBACK' });
    },
    release() {
      calls.push({ sql: 'RELEASE' });
    },
  };

  const originalGetConnection = pool.getConnection;
  pool.getConnection = async () => connection;
  t.after(() => {
    pool.getConnection = originalGetConnection;
  });
  return calls;
}

test('creates a reservation and persists its estimated cost', async (t) => {
  const calls = installConnection(t);
  const response = createResponse();

  await createReservation({
    body: requestBody,
    user: { id: 12, user_type_id: 4 },
  }, response);

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.status, 'success');
  const insert = calls.find((call) => call.sql.includes('INSERT INTO reserves'));
  assert.ok(insert);
  assert.equal(insert.params[6], 20);
  assert.ok(calls.some((call) => call.sql === 'COMMIT'));
  assert.ok(calls.some((call) => call.sql === 'RELEASE'));
});

test('rejects a reservation whose requested quantity exceeds stock', async (t) => {
  const calls = installConnection(t, { stock: 1 });
  const response = createResponse();

  await createReservation({
    body: requestBody,
    user: { id: 12, user_type_id: 4 },
  }, response);

  assert.equal(response.statusCode, 422);
  assert.match(response.body.message, /Máximo disponível: 1/);
  assert.ok(calls.some((call) => call.sql === 'BEGIN'));
  assert.ok(calls.some((call) => call.sql === 'ROLLBACK'));
  assert.ok(!calls.some((call) => call.sql === 'COMMIT'));
  assert.ok(calls.some((call) => call.sql === 'RELEASE'));
});
