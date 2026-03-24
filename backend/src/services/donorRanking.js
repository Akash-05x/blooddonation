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
 * and return the top-10 closest.
 *
 * @param {object} hospital  - Hospital record with latitude, longitude, blood_group
 * @param {string} bloodGroup - Requested blood group enum key
 * @param {number} radiusKm  - Search radius in km
 * @returns {Array<{donor, distance_km}>}  Top-10 scored donors
 */
async function findTop10Donors(hospital, bloodGroup, radiusKm) {
  const compatibleGroups = BLOOD_COMPATIBILITY[bloodGroup] || [bloodGroup];

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

  if (candidates.length === 0) return [];

  // Apply Haversine radius filter
  const nearby = filterWithinRadius(
    { latitude: hospital.latitude, longitude: hospital.longitude },
    candidates,
    radiusKm
  );

  // Top 10 sorted by distance (closest first)
  return nearby.slice(0, 10).map(d => ({
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

// ─── Main: assignDonors ───────────────────────────────────────────────────────
/**
 * Full orchestration:
 *  1. Transition request → DONOR_SEARCH
 *  2. Find top-10 nearby donors
 *  3. Create notification tokens + send parallel SMS+Call
 *  4. Transition request → AWAITING_CONFIRMATION
 *  5. Wait a window for confirmations (polling or triggered externally)
 *     — For immediate assignment (no wait), use pendingConfirmation=false
 *  6. Rank confirmed donors → Top 5
 *  7. Lock request (critical section) → assign PRIMARY + SECONDARY
 *  8. Transition request → ASSIGNED
 *  9. Emit real-time socket events
 *
 * @param {string}  requestId
 * @param {object}  io          - Socket.io server instance (optional)
 * @returns {{ primary, backup, notified: number }}
 */
async function assignDonors(requestId, io = null) {
  // ── Fetch request + hospital ────────────────────────────────────────────────
  const request = await prisma.emergencyRequest.findUnique({
    where: { id: requestId },
    include: { hospital: true },
  });
  if (!request) throw new Error('Emergency request not found.');

  // ── Fetch system config ─────────────────────────────────────────────────────
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

  // ── Phase 1: DONOR_SEARCH ───────────────────────────────────────────────────
  await prisma.emergencyRequest.update({
    where: { id: requestId },
    data:  { status: 'donor_search' },
  });
  if (io) {
    io.to(`role_hospital`).emit('request_status_change', { requestId, status: 'donor_search' });
    io.to('admin').emit('request_status_change', { requestId, status: 'donor_search' });
  }
  const radiusKm = request.search_radius_km || sysConfig.distance_radius;
  console.log(`[Ranking] Starting donor search for request ${requestId}. Group: ${request.blood_group}, Radius: ${radiusKm}km`);
  
  const top10 = await findTop10Donors(request.hospital, request.blood_group, radiusKm);
  console.log(`[Ranking] Found ${top10.length} compatible donors within radius.`);
  if (top10.length === 0) {
    await prisma.emergencyRequest.update({ where: { id: requestId }, data: { status: 'failed' } });
    return { primary: null, backup: null, notified: 0 };
  }

  // ── Phase 2: Create tokens + notify in parallel ──────────────────────────────
  const tokenRecords = await createNotificationTokens(
    top10.map(t => t.donor),
    requestId,
    sysConfig.notification_expiry_minutes
  );

  // Enrich top10 with token values for sending
  const tokenMap    = Object.fromEntries(tokenRecords.map(r => [r.donor_id, r.token]));
  const notifyList  = top10.map(({ donor, distance_km }, i) => ({
    donor,
    distance_km,
    role:  i === 0 ? 'primary' : 'backup',
    token: tokenMap[donor.id] || '',
  }));

  await sendNotificationsParallel(notifyList, request);

  // Emit socket events to each notified donor
  if (io) {
    console.log(`[Ranking] Emitting socket alerts to ${top10.length} donors...`);
    top10.forEach(({ donor, distance_km }, i) => {
      const targetRoom = `donor_${donor.user_id}`;
      console.log(`[Ranking] Emitting 'new_emergency' to room: ${targetRoom}`);
      io.to(targetRoom).emit('new_emergency', {
        requestId:      request.id,
        hospital:       request.hospital.hospital_name,
        hospitalAddress:request.hospital.address,
        bloodGroup:     request.blood_group,
        emergencyLevel: request.emergency_level,
        unitsRequired:  request.units_required,
        role:           i === 0 ? 'primary' : 'backup',
        distance_km,
        token:          tokenMap[donor.id],
        expiresInMins:  sysConfig.notification_expiry_minutes,
      });
    });
  }

  // Transition → AWAITING_CONFIRMATION
  await prisma.emergencyRequest.update({
    where: { id: requestId },
    data:  { status: 'awaiting_confirmation' },
  });
  console.log(`[DonorRanking] Phase 2: Notified ${top10.length} donors. Awaiting confirmation.`);

  // ── Phase 3 → 4: For immediate assignment use any donors who auto-confirm ─────
  // In real flow, this is triggered by token confirmation endpoint.
  // Here we immediately assign based on top-10 order (no wait) as fallback.
  const confirmed = await rankConfirmedDonors(requestId, request.hospital, top10);
  const toAssign  = confirmed.length >= 2 ? confirmed : 
    // Fallback: use top-10 order if no confirmations yet
    top10.slice(0, 2).map(({ donor, distance_km }, i) => ({
      donor,
      distance_km,
      score: 1 - i * 0.1,
      role:  i === 0 ? 'primary' : 'backup',
    }));

  // ── Phase 4: Critical section — lock + assign ───────────────────────────────
  const assignments = [];
  await prisma.$transaction(async (tx) => {
    // Acquire lock — check if already locked
    const locked = await tx.emergencyRequest.findUnique({ where: { id: requestId } });
    if (locked?.is_locked) throw new Error('Request is currently being processed. Try again.');

    // Set lock
    await tx.emergencyRequest.update({ where: { id: requestId }, data: { is_locked: true } });

    for (let i = 0; i < toAssign.length; i++) {
      const candidate = toAssign[i];

      const assignment = await tx.donorAssignment.upsert({
        where: { request_id_donor_id: { request_id: requestId, donor_id: candidate.donor.id } },
        create: {
          request_id:  requestId,
          donor_id:    candidate.donor.id,
          role:        'reserve',
          status:      'pending',
          score:       candidate.score,
          distance_km: candidate.distance_km,
        },
        update: { role: 'reserve', status: 'pending', score: candidate.score },
      });
      assignments.push({ ...assignment, donor: candidate.donor, distance_km: candidate.distance_km });
    }

    // Update status → ASSIGNED and release lock
    await tx.emergencyRequest.update({
      where: { id: requestId },
      data:  { status: 'assigned', is_locked: false },
    });
  });

  // Emit final assignment events
  if (io) {
    assignments.forEach(a => {
      io.to(`donor_${a.donor.user_id}`).emit('assignment_confirmed', {
        requestId,
        assignmentId: a.id,
        role:         a.role,
        hospital:     request.hospital.hospital_name,
        bloodGroup:   request.blood_group,
        emergencyLevel: request.emergency_level,
      });
    });
    io.to(`hospital_${request.hospital.user_id}`).emit('request_status_change', {
      requestId,
      status: 'assigned',
      primaryDonor:   assignments[0]?.donor?.user?.name,
      secondaryDonor: assignments[1]?.donor?.user?.name,
    });
    io.to('admin').emit('request_status_change', { requestId, status: 'assigned' });
  }

  console.log(`[DonorRanking] Phase 4: Assigned PRIMARY=${assignments[0]?.donor?.user?.name}, SECONDARY=${assignments[1]?.donor?.user?.name}`);

  return {
    primary:   assignments[0] || null,
    backup:    assignments[1] || null,
    notified:  top10.length,
  };
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

    // Mark request as needing new secondary
    await tx.emergencyRequest.update({
      where: { id: requestId },
      data:  { status: 'assigned' },
    });
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

module.exports = { findTop10Donors, rankConfirmedDonors, assignDonors, promoteBackupDonor };
