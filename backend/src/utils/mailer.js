const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;

function getTransporter() {
  if (config.otp.consoleMode) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
  }
  return transporter;
}

/**
 * Send an OTP email. Falls back to console logging in console mode.
 * @param {string} to - recipient email
 * @param {string} otp - OTP code
 * @param {string} purpose - "verification" | "reset"
 */
async function sendOTPEmail(to, otp, purpose = 'verification') {
  const subject =
    purpose === 'reset'
      ? 'Password Reset OTP - Blood Request System'
      : 'Email Verification OTP - Blood Request System';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; background: #f9f9f9; border-radius: 10px;">
      <div style="background: linear-gradient(135deg, #dc2626, #b91c1c); padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
        <h1 style="color: white; margin: 0; font-size: 24px;">🩸 Blood Request System</h1>
      </div>
      <h2 style="color: #1f2937;">${purpose === 'reset' ? 'Password Reset' : 'Verify Your Account'}</h2>
      <p style="color: #4b5563;">Your one-time password (OTP) is:</p>
      <div style="background: #dc2626; color: white; font-size: 36px; font-weight: bold; letter-spacing: 8px; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
        ${otp}
      </div>
      <p style="color: #6b7280; font-size: 14px;">This OTP expires in ${config.otp.expiryMinutes} minutes. Do not share it with anyone.</p>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 15px;">
        If you did not request this, please ignore this email or contact support.
      </p>
    </div>
  `;

  if (config.otp.consoleMode) {
    // Already logged in otp.js — nothing to do here
    return;
  }

  const mail = getTransporter();
  await mail.sendMail({
    from: config.smtp.from,
    to,
    subject,
    html,
  });
}

/**
 * Send a generic notification email
 */
async function sendEmail(to, subject, html) {
  if (config.otp.consoleMode) {
    console.log(`[MAIL] To: ${to} | Subject: ${subject}`);
    return;
  }
  const mail = getTransporter();
  await mail.sendMail({ from: config.smtp.from, to, subject, html });
}

module.exports = { sendOTPEmail, sendEmail };
