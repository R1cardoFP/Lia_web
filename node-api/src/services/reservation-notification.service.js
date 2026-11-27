const nodemailer = require('nodemailer');
const pool = require('../config/database.config');

function createTransporter() {
  const host = process.env.MAIL_HOST;
  const port = Number(process.env.MAIL_PORT ?? 587);
  const encryption = (process.env.MAIL_ENCRYPTION ?? 'tls').toLowerCase();
  const username = process.env.MAIL_USERNAME;
  const password = process.env.MAIL_PASSWORD;

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Configuração SMTP inválida: define MAIL_HOST e MAIL_PORT.');
  }
  if (!['', 'tls', 'ssl'].includes(encryption)) {
    throw new Error('MAIL_ENCRYPTION tem de ser tls, ssl ou vazio.');
  }
  if (Boolean(username) !== Boolean(password)) {
    throw new Error('Configuração SMTP incompleta: define MAIL_USERNAME e MAIL_PASSWORD.');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: encryption === 'ssl',
    requireTLS: encryption === 'tls',
    ...(username ? { auth: { user: username, pass: password } } : {}),
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
}

function getReservationUrl(reservationId) {
  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    throw new Error('APP_URL não está configurado.');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(appUrl);
  } catch {
    throw new Error('APP_URL tem de ser um endereço HTTP ou HTTPS válido.');
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('APP_URL tem de usar HTTP ou HTTPS.');
  }

  return `${appUrl.replace(/\/+$/, '')}/admin/reserves/${encodeURIComponent(reservationId)}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function createReservationEmailContent({ reservationId, description, requesterName }) {
  const reservationUrl = getReservationUrl(reservationId);
  const safeReservationId = escapeHtml(reservationId);
  const safeRequesterName = escapeHtml(requesterName || 'Não indicado');
  const safeDescription = escapeHtml(description || 'Sem descrição');
  const safeReservationUrl = escapeHtml(reservationUrl);

  return {
    subject: 'Nova Requisição Pendente de Aprovação',
    text: [
      `Nova requisição pendente (#${reservationId})`,
      'Estado: Pendente de aprovação',
      '',
      'Olá, Gestor!',
      'Existe um novo pedido de requisição pendente no sistema.',
      `Requisitante: ${requesterName || 'Não indicado'}`,
      `Detalhes do Pedido: ${description || 'Sem descrição'}`,
      `Analisar Requisição: ${reservationUrl}`,
      'Por favor, aceda à plataforma para aprovar ou rejeitar o pedido.',
    ].join('\n'),
    html: `<!doctype html>
<html lang="pt">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Nova Requisição Pendente de Aprovação</title>
  </head>
  <body style="margin:0;padding:32px 16px;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#334155;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Nova requisição pendente de aprovação na plataforma LIA.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:24px 32px;background-color:#12304a;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="color:#ffffff;font-size:19px;font-weight:bold;letter-spacing:1px;">LIA</td>
                    <td align="right" style="color:#cbd5e1;font-size:12px;letter-spacing:1px;">GESTÃO DE RESERVAS</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 32px 12px;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding:6px 10px;border-radius:20px;background-color:#fff7ed;color:#c2410c;font-size:11px;font-weight:bold;letter-spacing:.7px;">PENDENTE DE APROVAÇÃO</td>
                  </tr>
                </table>
                <h1 style="margin:16px 0 8px;color:#0f172a;font-size:25px;line-height:1.3;">Nova requisição</h1>
                <p style="margin:0;color:#64748b;font-size:14px;">Foi submetido um pedido que requer a sua análise.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 8px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:8px;border-collapse:separate;">
                  <tr>
                    <td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;width:145px;">Número da reserva</td>
                    <td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:14px;font-weight:bold;">#${safeReservationId}</td>
                  </tr>
                  <tr>
                    <td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;vertical-align:top;">Requisitante</td>
                    <td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:14px;">${safeRequesterName}</td>
                  </tr>
                  <tr>
                    <td style="padding:14px 16px;color:#64748b;font-size:13px;vertical-align:top;">Detalhes do pedido</td>
                    <td style="padding:14px 16px;color:#0f172a;font-size:14px;line-height:1.6;white-space:pre-wrap;">${safeDescription}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 12px;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="center" style="border-radius:6px;background-color:#2563eb;">
                      <a href="${safeReservationUrl}" style="display:inline-block;padding:14px 22px;border:1px solid #2563eb;border-radius:6px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">Analisar Requisição</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 28px;color:#64748b;font-size:13px;line-height:1.6;">
                Por favor, aceda à plataforma para aprovar ou rejeitar o pedido.
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;border-top:1px solid #e2e8f0;background-color:#f8fafc;color:#94a3b8;font-size:11px;line-height:1.5;">
                Esta é uma notificação automática da plataforma de Gestão de Reservas LIA.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
}

async function notifyManagersOfReservation({ reservationId, description, requesterName }) {
  const [managers] = await pool.query(
    `SELECT email
       FROM users
      WHERE user_type_id = 1
        AND email IS NOT NULL
        AND TRIM(email) <> ''`,
  );

  if (managers.length === 0) {
    return { skipped: true, reason: 'no_recipients' };
  }

  const fromAddress = process.env.MAIL_FROM_ADDRESS;
  if (!fromAddress) {
    throw new Error('MAIL_FROM_ADDRESS não está configurado.');
  }

  const transporter = createTransporter();
  const message = {
    from: {
      name: process.env.MAIL_FROM_NAME || 'Lia',
      address: fromAddress,
    },
    textEncoding: 'base64',
    ...createReservationEmailContent({ reservationId, description, requesterName }),
  };

  let results;
  try {
    results = await Promise.allSettled(
      managers.map(({ email }) => transporter.sendMail({ ...message, to: email })),
    );
  } finally {
    transporter.close();
  }

  const failed = results.filter((result) => result.status === 'rejected').length;
  if (failed > 0) {
    throw new Error(`Não foi possível enviar ${failed} de ${managers.length} emails aos gestores.`);
  }

  return { sent: results.length };
}

module.exports = { createReservationEmailContent, notifyManagersOfReservation };
