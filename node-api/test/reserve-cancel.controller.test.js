const assert = require('node:assert/strict');
const { test } = require('node:test');
const pool = require('../src/config/database.config');
const { cancelReservation } = require('../src/controllers/reserve.controller');

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
      if (sql.startsWith('SELECT id, user_id')) {
        return options.reservation
          ? [[options.reservation]]
          : [[]];
      }
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

test('cancels the authenticated user pending reservation', async (t) => {
  const calls = installConnection(t, {
    reservation: { id: 21, user_id: 7, reserve_state_id: 1 },
  });
  const response = createResponse();

  await cancelReservation({
    params: { id: '21' },
    user: { id: 7 },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, 'success');
  const update = calls.find((call) => call.sql.startsWith('UPDATE reserves'));
  assert.ok(update);
  assert.match(update.sql, /reserve_state_id = 10/);
  assert.ok(calls.some((call) => call.sql === 'COMMIT'));
  assert.ok(calls.some((call) => call.sql === 'RELEASE'));
});

test('rejects cancelling a reservation owned by another user', async (t) => {
  const calls = installConnection(t, {
    reservation: { id: 21, user_id: 9, reserve_state_id: 1 },
  });
  const response = createResponse();

  await cancelReservation({
    params: { id: '21' },
    user: { id: 7 },
  }, response);

  assert.equal(response.statusCode, 403);
  assert.ok(calls.some((call) => call.sql === 'ROLLBACK'));
  assert.ok(!calls.some((call) => call.sql.startsWith('UPDATE reserves')));
});

test('rejects cancelling a reservation that is no longer pending', async (t) => {
  const calls = installConnection(t, {
    reservation: { id: 21, user_id: 7, reserve_state_id: 2 },
  });
  const response = createResponse();

  await cancelReservation({
    params: { id: '21' },
    user: { id: 7 },
  }, response);

  assert.equal(response.statusCode, 400);
  assert.ok(calls.some((call) => call.sql === 'ROLLBACK'));
  assert.ok(!calls.some((call) => call.sql.startsWith('UPDATE reserves')));
});
