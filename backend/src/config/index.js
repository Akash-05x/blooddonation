require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',

  jwt: {
    secret: process.env.JWT_SECRET || 'fallback_secret_change_me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  otp: {
    consoleMode: process.env.OTP_CONSOLE_MODE === 'true',
    expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES) || 5,
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS) || 5,
  },

  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM,
  },

  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  distance_radius: parseInt(process.env.BLO_RADIUS_KM) || 50,
  notification_expiry_minutes: parseInt(process.env.BLO_NOTIF_EXPIRY) || 10,
};
