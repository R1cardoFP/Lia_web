const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const pool = require('../src/config/database.config');
const { updateProfile } = require('../src/controllers/profile.controller');
const {
  PROFILE_DIRECTORY,
  uploadProfileImage,
} = require('../src/middleware/profile-image.middleware');

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

test('updates profile fields and omits the password from the response', async (t) => {
  const calls = [];
  installQuery(t, async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT * FROM users')) {
      return [[{
        id: 7,
        name: 'Novo nome',
        email: 'user@example.test',
        password: 'stored-hash',
        remember_token: 'internal-token',
        phone: 912345678,
        curso: 'Informática',
        n_aluno: '12345',
        image: 'images/empty.png',
      }]];
    }
    return [{ affectedRows: 1 }];
  });
  const response = createResponse();

  await updateProfile({
    body: { name: 'Novo nome', phone: '912345678' },
    user: {
      id: 7,
      name: 'Nome antigo',
      phone: 912345679,
      curso: 'Informática',
      n_aluno: '12345',
      image: 'images/empty.png',
    },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.user.name, 'Novo nome');
  assert.equal(response.body.user.phone, 912345678);
  assert.equal('password' in response.body.user, false);
  assert.equal('remember_token' in response.body.user, false);
  assert.deepEqual(calls[0].params, [
    'Novo nome', '912345678', 'Informática', '12345', 'images/empty.png', 7,
  ]);
});

test('rejects invalid phone numbers without updating the database', async (t) => {
  let queryCount = 0;
  installQuery(t, async () => {
    queryCount += 1;
    return [[]];
  });
  const imagePath = path.join(os.tmpdir(), `lia-profile-${Date.now()}.png`);
  await fs.writeFile(imagePath, 'temporary upload');
  t.after(async () => {
    await fs.rm(imagePath, { force: true });
  });
  const response = createResponse();

  await updateProfile({
    body: { phone: '123' },
    file: { path: imagePath },
    user: { id: 7, phone: 912345678 },
  }, response);

  assert.equal(response.statusCode, 422);
  assert.equal(queryCount, 0);
  await assert.rejects(fs.access(imagePath));
});

test('accepts supported image uploads into the public profiles directory', async (t) => {
  const app = express();
  app.post('/upload', uploadProfileImage, (request, response) => {
    response.json({ path: request.file.path });
  });
  const server = await new Promise((resolve) => {
    const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const form = new FormData();
  form.append('image', new Blob(['test image'], { type: 'image/png' }), 'avatar.png');
  const response = await fetch(`http://127.0.0.1:${server.address().port}/upload`, {
    method: 'POST',
    body: form,
  });
  const result = await response.json();
  t.after(() => fs.rm(result.path, { force: true }));

  assert.equal(response.status, 200);
  assert.equal(path.dirname(result.path), PROFILE_DIRECTORY);
  assert.deepEqual(await fs.readFile(result.path), Buffer.from('test image'));
});
