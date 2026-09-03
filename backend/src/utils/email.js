const sgMail = require('@sendgrid/mail');
const nodemailer = require('nodemailer');

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'no-reply@kenbridge.school';

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

let transporter = null;
if (!SENDGRID_API_KEY && process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function sendMail(to, subject, text, html){
  // to can be string or array
  if (SENDGRID_API_KEY) {
    const msg = {
      to,
      from: EMAIL_FROM,
      subject,
      text,
      html
    };
    return sgMail.send(msg);
  }

  if (transporter) {
    const info = await transporter.sendMail({ from: EMAIL_FROM, to, subject, text, html });
    return info;
  }

  // fallback: log and resolve
  console.warn('No email provider configured. Skipping sending email to', to);
  return Promise.resolve();
}

module.exports = { sendMail };
