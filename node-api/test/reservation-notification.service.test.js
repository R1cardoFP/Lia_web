const assert = require('node:assert/strict');
const { test } = require('node:test');
const nodemailer = require('nodemailer');
const pool = require('../src/config/database.config');
const {
  createReservationEmailContent,
  notifyManagersOfReservation,
} = require('../src/services/reservation-notification.service');

const mailEnvironment = [
  'APP_URL',
  'MAIL_HOST',
  'MAIL_PORT',
  'MAIL_ENCRYPTION',
  'MAIL_USERNAME',
  'MAIL_PASSWORD',
  'MAIL_FROM_ADDRESS',
  'MAIL_FROM_NAME',
];

function installEnvironment(t) {
  const originalValues = Object.fromEntries(
    mailEnvironment.map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, {
    APP_URL: 'https://lia.example.test',
    MAIL_HOST: 'smtp.example.test',
    MAIL_PORT: '587',
    MAIL_ENCRYPTION: 'tls',
    MAIL_USERNAME: 'smtp-user',
    MAIL_PASSWORD: 'smtp-password',
    MAIL_FROM_ADDRESS: 'no-reply@example.test',
    MAIL_FROM_NAME: 'Lia',
  });
  t.after(() => {
    for (const [key, value] of Object.entries(originalValues)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function installMailMocks(t, managers, sendMail = async () => ({})) {
  const originalQuery = pool.query;
  const originalCreateTransport = nodemailer.createTransport;
  const messages = [];
  let transportOptions;
  let closed = false;

  pool.query = async (sql) => {
    assert.match(sql, /user_type_id = 1/);
    return [managers];
  };
  nodemailer.createTransport = (options) => {
    transportOptions = options;
    return {
      async sendMail(message) {
        messages.push(message);
        return sendMail(message);
      },
      close() {
        closed = true;
      },
    };
  };

  t.after(() => {
    pool.query = originalQuery;
    nodemailer.createTransport = originalCreateTransport;
  });

  return {
    messages,
    get transportOptions() { return transportOptions; },
    get closed() { return closed; },
  };
}

test('emails each manager with the reservation details and admin link', async (t) => {
  installEnvironment(t);
  const mocks = installMailMocks(t, [
    { email: 'manager1@example.test' },
    { email: 'manager2@example.test' },
  ]);

  const result = await notifyManagersOfReservation({
    reservationId: 42,
    description: 'Reparação de equipamento',
    requesterName: 'Utilizador',
  });

  assert.deepEqual(result, { sent: 2 });
  assert.deepEqual(mocks.messages.map(({ to }) => to), [
    'manager1@example.test',
    'manager2@example.test',
  ]);
  assert.match(mocks.messages[0].text, /Requisitante: Utilizador/);
  assert.match(mocks.messages[0].text, /Detalhes do Pedido: Reparação de equipamento/);
  assert.match(mocks.messages[0].text, /Nova requisição pendente \(#42\)/);
  assert.match(mocks.messages[0].text, /https:\/\/lia\.example\.test\/admin\/reserves\/42/);
  assert.equal(mocks.messages[0].subject, 'Nova Requisição Pendente de Aprovação');
  assert.equal(mocks.messages[0].textEncoding, 'base64');
  assert.match(mocks.messages[0].html, /PENDENTE DE APROVAÇÃO/);
  assert.match(mocks.messages[0].html, /Número da reserva/);
  assert.match(mocks.messages[0].html, /#42/);
  assert.match(mocks.messages[0].html, /Analisar Requisição/);
  assert.match(mocks.messages[0].html, /href="https:\/\/lia\.example\.test\/admin\/reserves\/42"/);
  assert.equal(mocks.transportOptions.requireTLS, true);
  assert.equal(mocks.closed, true);
});

test('escapes reservation content before inserting it into the HTML email', (t) => {
  installEnvironment(t);
  const content = createReservationEmailContent({
    reservationId: 42,
    description: '<img src=x onerror=alert(1)>',
    requesterName: 'Ana & <Gestora>',
  });

  assert.match(content.html, /Ana &amp; &lt;Gestora&gt;/);
  assert.match(content.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(content.html, /<img src=x/);
});

test('skips sending when there are no managers with email addresses', async (t) => {
  installEnvironment(t);
  const mocks = installMailMocks(t, []);

  const result = await notifyManagersOfReservation({
    reservationId: 42,
    description: 'Teste',
    requesterName: 'Utilizador',
  });

  assert.deepEqual(result, { skipped: true, reason: 'no_recipients' });
  assert.equal(mocks.messages.length, 0);
  assert.equal(mocks.transportOptions, undefined);
});

test('reports partial SMTP delivery failures after attempting all managers', async (t) => {
  installEnvironment(t);
  const mocks = installMailMocks(t, [
    { email: 'manager1@example.test' },
    { email: 'manager2@example.test' },
  ], async ({ to }) => {
    if (to === 'manager1@example.test') throw new Error('SMTP rejected recipient');
    return {};
  });

  await assert.rejects(
    notifyManagersOfReservation({
      reservationId: 42,
      description: 'Teste',
      requesterName: 'Utilizador',
    }),
    /Não foi possível enviar 1 de 2 emails aos gestores/,
  );
  assert.equal(mocks.messages.length, 2);
  assert.equal(mocks.closed, true);
});
