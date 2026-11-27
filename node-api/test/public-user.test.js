const assert = require('node:assert/strict');
const { test } = require('node:test');
const { publicUser } = require('../src/utils/public-user');

test('removes password and remember token from public user data', () => {
  const result = publicUser({
    id: 5,
    name: 'Test',
    password: 'password-hash',
    remember_token: 'remember-token',
  });

  assert.deepEqual(result, { id: 5, name: 'Test' });
});
