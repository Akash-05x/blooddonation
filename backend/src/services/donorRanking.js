/**
 * Donor Ranking Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements the full emergency blood request flow:
 *
 *  Phase 1 — DONOR SEARCH: Find top-10 nearby compatible donors
 *  Phase 2 — NOTIFY:       Send SMS + Call + generate/store tokens
 *  Phase 3 — RANK TOP 5:   Score confirmed donors by weighted formula
 *                           Score = 0.5×responseSpeed + 0.3×distanceScore + 0.2×donationHistory
 *  Phase 4 — ASSIGN:       DB-locked assignment → Rank1=PRIMARY, Rank2=SECONDARY
 */

const prisma  = require('../config/prisma');
const sysConfig = require('../config');
const { filterWithinRadius } = require('../utils/haversine');
const {
  createNotificationTokens,
  sendNotificationsParallel,
} = require('./notificationService');

// ─── Blood Compatibility Map ──────────────────────────────────────────────────
// Maps requested blood group → compatible donor blood groups
const BLOOD_COMPATIBILITY = {
  'O_NEG':  ['O_NEG'],
  'O_POS':  ['O_POS',  'O_NEG'],
  'A_NEG':  ['A_NEG',  'O_NEG'],
  'A_POS':  ['A_POS',  'A_NEG', 'O_POS', 'O_NEG'],
  'B_NEG':  ['B_NEG',  'O_NEG'],
  'B_POS':  ['B_POS',  'B_NEG', 'O_POS', 'O_NEG'],
  'AB_NEG': ['AB_NEG', 'A_NEG', 'B_NEG', 'O_NEG'],
  'AB_POS': ['AB_POS', 'AB_NEG', 'A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'O_POS', 'O_NEG'],
};

// ─── Normalization helper ─────────────────────────────────────────────────────
function normalize(value, min, max) {
  if (max === min) return 1;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

// ─── Weighted Scoring Formula ─────────────────────────────────────────────────
/**
 * Score  = 0.5 × responseSpeed  + 0.3 × distanceScore + 0.2 × donationHistory
 * Where:
 *   responseSpeed   = 1 / responseTimeMinutes  (faster = better)
 *   distanceScore   = 1 / distance_km          (closer = better)
 *   donationHistory = total successful donations (more = better)
 *
 * All three are normalized to [0,1] before weighting.
 */
function computeScore(donor, distance_km, responseSpeed, historyRange) {
  // Raw values
  const rawSpeed    = responseSpeed;                          // already 1/time or default
  const rawDist     = distance_km > 0 ? 1 / distance_km : 10; // inverse distance
  const rawHistory  = donor.donation_count || 0;

  // Normalize each to 0-1 within the candidate pool
  const normSpeed   = normalize(rawSpeed,   historyRange.minSpeed,   historyRange.maxSpeed);
  const normDist    = normalize(rawDist,    historyRange.minDist,    historyRange.maxDist);
  const normHistory = normalize(rawHistory, historyRange.minHistory, historyRange.maxHistory);

  return 0.5 * normSpeed + 0.3 * normDist + 0.2 * normHistory;
}

// ─── Phase 1: Find Top 10 Donors ─────────────────────────────────────────────
/**
 * Fetch all eligible donors within radius, apply blood compatibility filter,
 * and return the top-10 closest. Same-district donors are always listed first.
 *
 * @param {object} hospital      - Hospital record with latitude, longitude
 * @param {string} bloodGroup    - Requested blood group enum key
 * @param {number} radiusKm      - Search radius in km
 * @param {number} [overrideLat] - Live GPS latitude (overrides hospital.latitude)
 * @param {number} [overrideLng] - Live GPS longitude (overrides hospital.longitude)
 * @param {string} [district]    - Hospital's district for priority filtering
 * @returns {Array<{donor, distance_km}>}  Top-10 scored donors
 */
async function findTop10Donors(hospital, bloodGroup, radiusKm, overrideLat, overrideLng, district) {
  const compatibleGroups = BLOOD_COMPATIBILITY[bloodGroup] || [bloodGroup];

  const searchLat = overrideLat != null ? overrideLat : hospital.latitude;
  const searchLng = overrideLng != null ? overrideLng : hospital.longitude;
  const safeRadius = parseFloat(radiusKm) || 1000; // Use a massive backup radius for testing

  console.log(`[Ranking Debug] Searching ${safeRadius}km around [${searchLat}, ${searchLng}] for ${bloodGroup}`);

  // Fetch all eligible donors
  const candidates = await prisma.donor.findMany({
    where: {
      blood_group:        { in: compatibleGroups },
      availability_status: true,
      vacation_mode:      false,
      latitude:           { not: null },
      longitude:          { not: null },
      user:               { is_blocked: false },
    },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
  });

  console.log(`[Ranking Debug] DB found ${candidates.length} candidates globally for ${compatibleGroups.join(',')}`);
  if (candidates.length === 0) return [];

  // Apply Haversine radius filter using live location
  const nearby = filterWithinRadius(
    { latitude: searchLat, longitude: searchLng },
    candidates,
    safeRadius
  );

  console.log(`[Ranking Debug] Haversine kept ${nearby.length} donors within ${safeRadius}km radius`);
  if (nearby.length === 0) return [];

  // ── District Priority ───────────────────────────────────────────────────────
  // If a district is specified, same-district donors appear first
  let sorted;
  if (district) {
    const normalizedDistrict = district.toLowerCase().trim();
    const sameDistrict = [];
    const otherDistrict = [];
    nearby.forEach(d => {
      if (d.district && d.district.toLowerCase().trim() === normalizedDistrict) {
        sameDistrict.push(d);
      } else {
        otherDistrict.push(d);
      }
    });
    // Sort each group by distance, then combine: same-district first
    sameDistrict.sort((a, b) => a.distance_km - b.distance_km);
    otherDistrict.sort((a, b) => a.distance_km - b.distance_km);
    sorted = [...sameDistrict, ...otherDistrict];
    console.log(`[Ranking] District filter '${district}': ${sameDistrict.length} same-district, ${otherDistrict.length} others.`);
  } else {
    sorted = nearby.sort((a, b) => a.distance_km - b.distance_km);
  }

  // Top 10 sorted
  return sorted.slice(0, 10).map(d => ({
    donor:       d,
    distance_km: parseFloat(d.distance_km.toFixed(2)),
  }));
}

// ─── Phase 3: Rank Confirmed Donors (Top 5) ──────────────────────────────────
/**
 * After donors confirm, fetch confirmed records and rank by weighted score.
 * Returns top-5 scored donors.
 *
 * @param {string} requestId
 * @param {object} hospital
 * @param {Array}  notifiedDonors - The original top-10 with distance_km
 * @returns {Array<{donor, score, distance_km, role}>}
 */
async function rankConfirmedDonors(requestId, hospital, notifiedDonors) {
  // Fetch confirmed tokens for this request
  const confirmedTokens = await prisma.notificationToken.findMany({
    where: { request_id: requestId, status: 'confirmed' },
    include: { donor: { include: { user: true } } },
  });

  if (confirmedTokens.length === 0) return [];

  // Build a map of donorId → original notification data (for distance)
  const notifiedMap = Object.fromEntries(
    notifiedDonors.map(n => [n.donor.id, n])
  );

  // Enrich confirmed donors with distance + response speed
  const enriched = confirmedTokens.map(ct => {
    const original     = notifiedMap[ct.donor_id] || {};
    const distance_km  = original.distance_km || 1;
    // Response speed: 1 / minutes-to-respond (faster = higher)
    const respondedAt  = ct.responded_at || new Date();
    const createdAt    = ct.created_at;
    const minutesTaken = Math.max(0.1, (new Date(respondedAt) - new Date(createdAt)) / 60000);
    const responseSpeed = 1 / minutesTaken;

    return {
      donor:         ct.donor,
      distance_km,
      responseSpeed,
      donationCount: ct.donor.donation_count || 0,
    };
  });

  // Pre-compute ranges for normalization
  const speeds       = enriched.map(e => e.responseSpeed);
  const dists        = enriched.map(e => 1 / e.distance_km);
  const histories    = enriched.map(e => e.donationCount);
  const historyRange = {
    minSpeed:   Math.min(...speeds),   maxSpeed:   Math.max(...speeds),
    minDist:    Math.min(...dists),    maxDist:    Math.max(...dists),
    minHistory: Math.min(...histories),maxHistory: Math.max(...histories),
  };

  // Score and sort
  const scored = enriched.map(e => ({
    donor:       e.donor,
    distance_km: e.distance_km,
    score: parseFloat(computeScore(e.donor, e.distance_km, e.responseSpeed, historyRange).toFixed(4)),
  }));
  scored.sort((a, b) => b.score - a.score);

  // Return top 5 with roles
  return scored.slice(0, 5).map((item, i) => ({
    ...item,
    role: i === 0 ? 'primary' : i === 1 ? 'backup' : 'reserve',
  }));
}

/**
 * PHASE 1 & 2: Initiate Emergency Search
 *  1. Transition request → DONOR_SEARCH
 *  2. Find compatible donors (Top 10 or all in radius)
 *  3. Create notification tokens
 *  4. Send notifications (SMS/Call/Socket)
 *  5. Transition request → AWAITING_CONFIRMATION
 *
 * @param {string}  requestId
 * @param {object}  io          - Socket.io server instance
 * @param {object}  [opts]      - { overrideLat, overrideLng, district, radius }
 */
async function initiateEmergencySearch(requestId, io = null, opts = {}) {
  const { overrideLat, overrideLng, district, radius } = opts;
  
  const request = await prisma.emergencyRequest.findUnique({
    where: { id: requestId },
    include: { hospital: true },
  });
  if (!request) throw new Error('Emergency request not found.');

  let sysConfig = await prisma.systemConfiguration.findFirst();
  if (!sysConfig) {
    sysConfig = await prisma.systemConfiguration.create({
      data: {
        distance_radius:       50,
        ranking_weight_response: 0.5,
        ranking_weight_distance: 0.3,
        ranking_weight_history:  0.2,
        gps_timeout_minutes:     2,
        notification_expiry_minutes: 10,
      },
    });
  }

  // 1. Transition → DONOR_SEARCH
  await prisma.emergencyRequest.update({
    where: { id: requestId },
    data:  { status: 'donor_search' },
  });
  if (io) {
    io.to(`role_hospital`).emit('request_status_change', { requestId, status: 'donor_search' });
    io.to('admin').emit('request_status_change', { requestId, status: 'donor_search' });
  }

  const radiusKm = radius || request.search_radius_km || 150;
  const lat = overrideLat ?? request.request_lat ?? request.hospital.latitude;
  const lng = overrideLng ?? request.request_lng ?? request.hospital.longitude;
  const searchDistrict = district ?? request.request_district ?? null;

  // 2. Find compatible donors
  const top10 = await findTop10Donors(request.hospital, request.blood_group, radiusKm, lat, lng, searchDistrict);
  if (top10.length === 0) {
    await prisma.emergencyRequest.update({ where: { id: requestId }, data: { status: 'failed' } });
    return { notified: 0, status: 'failed' };
  }

  // 3. Create tokens
  const tokenRecords = await createNotificationTokens(
    top10.map(t => t.donor),
    requestId,
    sysConfig.notification_expiry_minutes
  );

  // 4. Send notifications
  const tokenMap = Object.fromEntries(tokenRecords.map(r => [r.donor_id, r.token]));
  const notifyList = top10.map(({ donor, distance_km }, i) => ({
    donor,
    distance_km,
    role:  i === 0 ? 'primary' : 'backup', // Tentative roles for notification text
    token: tokenMap[donor.id] || '',
  }));

  await sendNotificationsParallel(notifyList, request);

  if (io) {
    top10.forEach(({ donor, distance_km }, i) => {
      const targetRoom = `donor_${donor.user_id}`;
      const isSameDistrict = searchDistrict && donor.district &&
        donor.district.toLowerCase().trim() === searchDistrict.toLowerCase().trim();
      
      io.to(targetRoom).emit('new_emergency', {
        requestId:       request.id,
        hospital:        request.hospital.hospital_name,
        hospitalAddress: request.hospital.address,
        hospitalLat:     lat,
        hospitalLng:     lng,
        bloodGroup:      request.blood_group,
        emergencyLevel:  request.emergency_level,
        unitsRequired:   request.units_required,
        district:        searchDistrict,
        isSameDistrict:  isSameDistrict,
        role:            i === 0 ? 'primary' : 'backup',
        distance_km,
        token:           tokenMap[donor.id],
        expiresInMins:   sysConfig.notification_expiry_minutes,
      });
    });
  }

  // 5. Transition → AWAITING_CONFIRMATION
  await prisma.emergencyRequest.update({
    where: { id: requestId },
    data:  { status: 'awaiting_confirmation' },
  });

  return { notified: top10.length, status: 'awaiting_confirmation' };
}

/**
 * PHASE 3 & 4: Finalize Assignment
 *  1. Rank donors who confirmed ('confirmed' status in NotificationToken)
 *  2. Assign PRIMARY and SECONDARY roles
 *  3. Transition request → ASSIGNED
 *
 * @param {string} requestId
 * @param {object} io
 */
async function finalizeEmergencyAssignment(requestId, io = null) {
  const request = await prisma.emergencyRequest.findUnique({
    where: { id: requestId },
    include: { hospital: true },
  });
  if (!request) throw new Error('Emergency request not found.');

  // Fetch all notified donors (to get distances)
  const tokens = await prisma.notificationToken.findMany({
    where: { request_id: requestId },
    include: { donor: true },
  });

  // Simple distance map from tokens (we can re-calculate but tokens have donor IDs)
  // For ranking we need distances. Since we don't store distance in Token, 
  // we'll re-calculate or just query assignments (if any were pre-created).
  // Actually, rankConfirmedDonors needs the 'notifiedDonors' array with distance_km.
  

  const { calculateDistance } = require('../utils/haversine');
  const notifiedDonors = tokens.map(t => {
    const dist = calculateDistance(
      request.request_lat || request.hospital.latitude,
      request.request_lng || request.hospital.longitude,
      t.donor.latitude,
      t.donor.longitude
    );
    return { donor: t.donor, distance_km: dist };
  });

  const confirmed = await rankConfirmedDonors(requestId, request.hospital, notifiedDonors);
  
  if (confirmed.length === 0) {
    // No one confirmed yet. Should we wait or fail?
    // For "response-driven", we might wait. But if finalizing, we might need a fallback.
    return { success: false, message: 'No confirmed donors to assign.' };
  }

  const assignments = [];
  await prisma.$transaction(async (tx) => {
    await tx.emergencyRequest.update({ where: { id: requestId }, data: { is_locked: true } });

    // Assign top 2 as primary/backup, others as reserve
    for (let i = 0; i < confirmed.length; i++) {
      const candidate = confirmed[i];
      const role = i === 0 ? 'primary' : i === 1 ? 'backup' : 'reserve';

      const assignment = await tx.donorAssignment.upsert({
        where: { request_id_donor_id: { request_id: requestId, donor_id: candidate.donor.id } },
        create: {
          request_id:  requestId,
          donor_id:    candidate.donor.id,
          role:        role,
          status:      'pending',
          score:       candidate.score,
          distance_km: candidate.distance_km,
        },
        update: { role: role, score: candidate.score },
      });
      assignments.push({ ...assignment, donor: candidate.donor });
    }

    await tx.emergencyRequest.update({
      where: { id: requestId },
      data:  { status: 'assigned', is_locked: false },
    });
  });

  if (io) {
    assignments.forEach(a => {
      io.to(`donor_${a.donor.user_id}`).emit('assignment_confirmed', {
        requestId,
        assignmentId: a.id,
        role:         a.role,
        hospital:     request.hospital.hospital_name,
      });
    });
    io.to(`hospital_${request.hospital.user_id}`).emit('request_status_change', {
      requestId,
      status: 'assigned',
      primary: assignments[0]?.donor?.name,
      backup:  assignments[1]?.donor?.name,
    });
  }

  return { success: true, primary: assignments[0], backup: assignments[1] };
}

// Keep assignDonors for backward compatibility but redirect to new flow
async function assignDonors(requestId, io = null, opts = {}) {
  const init = await initiateEmergencySearch(requestId, io, opts);
  // Short delay for "immediate" ranking if desired, otherwise wait for responses
  // For now, let's keep it split and have the controller handle the wait if needed.
  return init;
}

// ─── Promote Backup to Primary ────────────────────────────────────────────────
/**
 * Auto-promote backup donor to primary when primary fails.
 * Tries to find the next best unassigned donor to fill the backup slot.
 */
async function promoteBackupDonor(requestId, io = null) {
  // Find current active backup
  const backup = await prisma.donorAssignment.findFirst({
    where: {
      request_id: requestId,
      role:       'backup',
      status:     { in: ['pending', 'accepted'] },
    },
    include: { donor: { include: { user: true } }, request: { include: { hospital: true } } },
  });

  if (!backup) throw new Error('No backup donor available to promote.');

  // Use transaction for atomic promotion
  await prisma.$transaction(async (tx) => {
    // Promote backup → primary
    await tx.donorAssignment.update({
      where: { id: backup.id },
      data:  { role: 'primary', status: 'pending' },
    });

    // Mark request as needing new secondary, or keep it assigned if handled
    await tx.emergencyRequest.update({
      where: { id: requestId },
      data:  { status: 'assigned' },
    });

    // Try to auto-fill secondary if we have a reserve donor available
    const bestReserve = await tx.donorAssignment.findFirst({
       where: { request_id: requestId, role: 'reserve', status: { notIn: ['rejected', 'failed'] } },
       orderBy: { score: 'desc' }
    });
    if (bestReserve) {
      await tx.donorAssignment.update({
        where: { id: bestReserve.id },
        data: { role: 'backup', status: 'pending' }
      });
      // (Sockets should be sent individually outside TX but we can just update DB here safely)
    }
  });

  // Notify promoted donor
  if (io && backup.donor) {
    io.to(`donor_${backup.donor.user_id}`).emit('promoted_to_primary', {
      requestId,
      message: 'You have been promoted to PRIMARY donor for this emergency. Please proceed immediately.',
      hospital: backup.request?.hospital?.hospital_name,
    });
    io.to(`hospital_${backup.request?.hospital?.user_id}`).emit('failover_alert', {
      requestId,
      message: 'Primary donor failed. Backup donor has been promoted to primary.',
      newPrimaryName: backup.donor.user?.name,
    });
    io.to('admin').emit('failover_alert', { requestId, donorId: backup.donor_id });
  }

  return backup;
}

module.exports = { 
  findTop10Donors, 
  rankConfirmedDonors, 
  initiateEmergencySearch, 
  finalizeEmergencyAssignment,
  assignDonors, 
  promoteBackupDonor 
};
