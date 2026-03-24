const crypto = require('crypto');
const prisma = require('../config/prisma');
const config = require('../config');

/**
 * Generate a cryptographically secure 6-digit OTP
 */
function generateOTPCode() {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Count how many OTPs a user has requested in the last N minutes
 */
async function recentOTPCount(userId, withinMinutes = 60) {
  const since = new Date(Date.now() - withinMinutes * 60 * 1000);
  return prisma.oTPLog.count({
    where: { user_id: userId, created_at: { gte: since } },
  });
}

/**
 * Calculate adaptive expiry:
 *  - < 3 requests in 10 min → standard 5 min
 *  - ≥ 3 requests in 10 min → shortened 2 min
 *  - ≥ 10 requests in 1 hour → throw fraud error
 */
async function getAdaptiveExpiryMinutes(userId) {
  const hourlyCount = await recentOTPCount(userId, 60);
  if (hourlyCount >= 10) {
    throw new Error('FRAUD_DETECTED: Too many OTP requests. Account temporarily locked.');
  }
  const recentCount = await recentOTPCount(userId, 10);
  return recentCount >= 3 ? 2 : config.otp.expiryMinutes;
}

/**
 * Create a new OTP record in the database
 * @param {string} userId
 * @param {string} purpose - "verification" | "reset"
 * @returns {{ otp: string, expiry: Date }}
 */
async function createOTP(userId, purpose = 'verification') {
  // Expire any previous pending OTPs for this user/purpose
  await prisma.oTPLog.updateMany({
    where: { user_id: userId, purpose, status: 'pending' },
    data: { status: 'expired' },
  });

  const expiryMinutes = await getAdaptiveExpiryMinutes(userId);
  const otp = generateOTPCode();
  const expiry = new Date(Date.now() + expiryMinutes * 60 * 1000);

  await prisma.oTPLog.create({
    data: {
      user_id: userId,
      otp_code: otp,
      expiry_time: expiry,
      purpose,
      status: 'pending',
    },
  });

  if (config.otp.consoleMode) {
    console.log(`\n╔══════════════════════════════════╗`);
    console.log(`║  OTP [${purpose}]: ${otp} (${expiryMinutes} min) ║`);
    console.log(`╚══════════════════════════════════╝\n`);
  }

  return { otp, expiry };
}

/**
 * Validate an OTP for a user
 * @param {string} userId
 * @param {string} otpCode
 * @param {string} purpose
 * @returns {boolean}
 * @throws on invalid OTP or lockout
 */
async function validateOTP(userId, otpCode, purpose = 'verification') {
  const log = await prisma.oTPLog.findFirst({
    where: { user_id: userId, purpose, status: 'pending' },
    orderBy: { created_at: 'desc' },
  });

  if (!log) {
    throw new Error('No pending OTP found. Please request a new one.');
  }

  // Increment attempts
  const updated = await prisma.oTPLog.update({
    where: { id: log.id },
    data: { attempts: { increment: 1 } },
  });

  if (updated.attempts >= config.otp.maxAttempts) {
    await prisma.oTPLog.update({ where: { id: log.id }, data: { status: 'locked' } });
    throw new Error('Too many failed attempts. OTP locked. Please request a new one.');
  }

  if (new Date() > log.expiry_time) {
    await prisma.oTPLog.update({ where: { id: log.id }, data: { status: 'expired' } });
    throw new Error('OTP has expired. Please request a new one.');
  }

  if (log.otp_code !== otpCode) {
    const remaining = config.otp.maxAttempts - updated.attempts;
    throw new Error(`Invalid OTP. ${remaining} attempt(s) remaining.`);
  }

  // Mark as used
  await prisma.oTPLog.update({ where: { id: log.id }, data: { status: 'used' } });
  return true;
}

module.exports = { createOTP, validateOTP, generateOTPCode };
