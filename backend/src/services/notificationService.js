/**
 * Notification Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles the notification phase of the emergency blood request flow:
 *  1. Generate a cryptographically-secure token per donor
 *  2. Persist NotificationToken records to the DB
 *  3. Mock-send SMS + Call in parallel for each of the top-10 donors
 */

const crypto = require('crypto');
const prisma  = require('../config/prisma');

// ─── Token Generation ─────────────────────────────────────────────────────────

/**
 * Generate a cryptographically-secure 32-byte hex token.
 * @returns {string} 64-character hex string
 */
function generateSecureToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ─── Mock Notification Senders ────────────────────────────────────────────────

/**
 * Mock SMS sender — in production replace with Twilio / AWS SNS / etc.
 * @param {string} phone      - Recipient phone number
 * @param {string} message    - SMS body
 * @param {object} meta       - Extra context for logging
 */
function mockSendSMS(phone, message, meta = {}) {
  const border = '─'.repeat(60);
  console.log(`\n📱 [SMS MOCK] ${border}`);
  console.log(`   TO      : ${phone}`);
  console.log(`   MESSAGE : ${message}`);
  if (meta.token) console.log(`   TOKEN   : ${meta.token.substring(0, 16)}...`);
  if (meta.role)  console.log(`   ROLE    : ${meta.role}`);
  console.log(`   TIME    : ${new Date().toISOString()}`);
  console.log(`${border}\n`);
  // Simulate async network call
  return new Promise(resolve => setTimeout(resolve, 50));
}

/**
 * Mock Call sender — in production replace with Twilio Calls / etc.
 * @param {string} phone   - Recipient phone number
 * @param {string} message - Spoken/text message for the call
 * @param {object} meta    - Extra context for logging
 */
function mockSendCall(phone, message, meta = {}) {
  const border = '─'.repeat(60);
  console.log(`\n📞 [CALL MOCK] ${border}`);
  console.log(`   TO      : ${phone}`);
  console.log(`   MESSAGE : ${message}`);
  if (meta.role) console.log(`   ROLE    : ${meta.role}`);
  console.log(`   TIME    : ${new Date().toISOString()}`);
  console.log(`${border}\n`);
  // Simulate async call initiation delay
  return new Promise(resolve => setTimeout(resolve, 80));
}

// ─── Token Persistence ────────────────────────────────────────────────────────

/**
 * Create NotificationToken records for a list of donors.
 * Tokens expire in `expiryMinutes` minutes (default 10).
 *
 * @param {Array<{id: string, user: {phone: string}}>} donors  - Donor objects
 * @param {string}                                    requestId - EmergencyRequest ID
 * @param {number}                                    expiryMinutes
 * @returns {Array<{donorId, token, expiresAt}>}
 */
async function createNotificationTokens(donors, requestId, expiryMinutes = 10) {
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  const tokenRecords = donors.map(donor => ({
    donor_id:   donor.id,
    request_id: requestId,
    token:      generateSecureToken(),
    status:     'pending',
    expires_at: expiresAt,
  }));

  // Bulk upsert: create new tokens or reset existing ones for the same donor+request
  await prisma.$transaction(
    tokenRecords.map(record =>
      prisma.notificationToken.upsert({
        where: {
          // Use a compound unique key via findFirst approach; token is unique so we create/update carefully
          token: record.token,
        },
        create: record,
        update: { status: 'pending', expires_at: expiresAt },
      })
    )
  );

  return tokenRecords;
}

// ─── Parallel Notification Dispatch ─────────────────────────────────────────

/**
 * Send SMS + Call notifications to all donors in parallel.
 * Uses Promise.all so all send attempts run concurrently.
 *
 * @param {Array<{donor, distance_km, role, token}>} notifyList  - Enriched donor list
 * @param {object}                                   request      - EmergencyRequest with hospital data
 * @returns {Promise<void>}
 */
async function sendNotificationsParallel(notifyList, request) {
  const hospitalName = request.hospital?.hospital_name || 'A nearby hospital';
  const bloodGroup   = request.blood_group?.replace('_POS', '+').replace('_NEG', '-');
  const level        = request.emergency_level?.toUpperCase();

  const notificationJobs = notifyList.flatMap(({ donor, distance_km, role, token }) => {
    const phone = donor.user?.phone || 'UNKNOWN';
    const name  = donor.user?.name  || 'Donor';

    const smsMessage = 
      `🚨 URGENT BLOOD REQUEST | ${level}\n` +
      `Hospital: ${hospitalName}\n` +
      `Blood Group: ${bloodGroup}\n` +
      `Distance: ${Number(distance_km).toFixed(1)} km\n` +
      `Your Role: ${role.toUpperCase()}\n` +
      `Confirm by replying with token: ${token.substring(0, 12)}...\n` +
      `This request expires in 10 minutes.`;

    const callMessage =
      `Hello ${name}, this is an urgent blood donation request from ${hospitalName}. ` +
      `They need ${bloodGroup} blood immediately. You are ${Number(distance_km).toFixed(1)} kilometers away. ` +
      `Please confirm your availability via the app or SMS urgently.`;

    // Return both SMS and Call jobs for this donor in parallel
    return [
      mockSendSMS(phone, smsMessage, { token, role }),
      mockSendCall(phone, callMessage, { role }),
    ];
  });

  // Run ALL notifications in parallel
  await Promise.all(notificationJobs);

  console.log(`[NotificationService] ✅ Sent ${notifyList.length * 2} notifications (SMS + Call) to ${notifyList.length} donors.`);
}

// ─── Token Validation ─────────────────────────────────────────────────────────

/**
 * Validate a donor's confirmation token:
 *  - Token must exist
 *  - Token must not be expired
 *  - Token status must be 'pending'
 * On success: updates status to 'confirmed' and records response time.
 *
 * @param {string} token      - The raw hex token from the donor
 * @param {string} donorId    - Donor's DB ID (for ownership verification)
 * @returns {{ valid: boolean, notificationToken?: object, error?: string }}
 */
async function validateAndConfirmToken(token, donorId) {
  const record = await prisma.notificationToken.findUnique({ where: { token } });

  if (!record) {
    return { valid: false, error: 'Token not found.' };
  }
  if (record.donor_id !== donorId) {
    return { valid: false, error: 'Token does not belong to this donor.' };
  }
  if (record.status !== 'pending') {
    return { valid: false, error: `Token is already ${record.status}.` };
  }
  if (new Date() > new Date(record.expires_at)) {
    // Mark as expired in DB
    await prisma.notificationToken.update({
      where: { id: record.id },
      data: { status: 'expired' },
    });
    return { valid: false, error: 'Token has expired.' };
  }

  // Confirm the token
  const updated = await prisma.notificationToken.update({
    where: { id: record.id },
    data: { status: 'confirmed', responded_at: new Date() },
  });

  return { valid: true, notificationToken: updated };
}

module.exports = {
  generateSecureToken,
  createNotificationTokens,
  sendNotificationsParallel,
  validateAndConfirmToken,
  mockSendSMS,
  mockSendCall,
};
