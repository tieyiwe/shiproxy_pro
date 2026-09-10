// Sends transactional email via SMTP when configured (SMTP_HOST/PORT/USER/PASS
// env vars). No email provider has been chosen yet, so with those unset this
// falls back to logging the message to the console instead of failing -
// lets the rest of the app (guest package tracking) work end to end now,
// and start actually delivering mail the moment real SMTP credentials are
// added, with no code change.
const nodemailer = require('nodemailer');

function buildTransport() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

async function sendMail({ to, subject, text, html }) {
  const transport = buildTransport();
  const from = process.env.SMTP_FROM || 'ShipRoxy <no-reply@shiproxy.example.com>';

  if (!transport) {
    console.log(`[mailer] No SMTP_HOST configured - logging email instead of sending.
  To: ${to}
  Subject: ${subject}
  ${text}`);
    return { delivered: false };
  }

  await transport.sendMail({ from, to, subject, text, html });
  return { delivered: true };
}

module.exports = { sendMail };
