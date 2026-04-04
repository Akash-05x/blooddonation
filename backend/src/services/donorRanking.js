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
const { haversineDistance } = require('../utils/haversine');
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
async function findTop10Donors(hospital, bloodGroup, radiusKm, overrideLat, overrideLng, district, excludeDonorIds = []) {
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
      ...(excludeDonorIds.length > 0 && { id: { notIn: excludeDonorIds } }),
      user:               { is_blocked: false },
    },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
  });

  console.log(`[Ranking Debug] DB found ${candidates.length} candidates globally for ${compatibleGroups.join(',')}`);
  if (candidates.length === 0) return [];

  // Apply Haversine radius filter + Same District Fallback
  const nearby = [];
  const normDistrict = district ? district.toLowerCase().trim() : '';

  candidates.forEach(d => {
    let keep = false;
    let dist = 9999;
    const isSameDistrict = normDistrict && d.district && d.district.toLowerCase().trim() === normDistrict;

    if (d.latitude != null && d.longitude != null && searchLat != null && searchLng != null) {
      dist = haversineDistance(searchLat, searchLng, d.latitude, d.longitude);
      if (dist <= safeRadius) keep = true;
    }

    if (isSameDistrict) {
      keep = true;
      if (dist === 9999) dist = Math.min(safeRadius - 1, 20); // Default simulated distance
    }

    if (keep) {
      d.distance_km = dist === 9999 ? safeRadius : dist;
      nearby.push(d);
    }
  });

  console.log(`[Ranking Debug] Filter kept ${nearby.length} donors (radius ${safeRadius}km + same-district fallback)`);
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
        gps_timeout_minutes:     5,
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

  // 1b. Fetch donors who already failed/rejected to exclude them
  const expiredAssignments = await prisma.donorAssignment.findMany({
    where: { request_id: requestId, status: { in: ['failed', 'rejected'] } },
    select: { donor_id: true }
  });
  const excludeDonorIds = expiredAssignments.map(a => a.donor_id);

  // 2. Find compatible donors
  const top10 = await findTop10Donors(request.hospital, request.blood_group, radiusKm, lat, lng, searchDistrict, excludeDonorIds);
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
  
  const notifiedDonors = tokens.map(t => {
    const dist = haversineDistance(
      request.request_lat || request.hospital.latitude,
      request.request_lng || request.hospital.longitude,
      t.donor.latitude,
      t.donor.longitude
    );
    return { donor: t.donor, distance_km: dist };
  });

  const confirmed = await rankConfirmedDonors(requestId, request.hospital, notifiedDonors);
  console.log(`[FinalizeAssignments] Found ${confirmed.length} confirmed donors (ids: ${confirmed.map(c => c.donor.id).join(', ')})`);
  
  if (confirmed.length === 0) {
    // No one confirmed yet. Should we wait or fail?
    // For "response-driven", we might wait. But if finalizing, we might need a fallback.
    return { success: false, message: 'No confirmed donors to assign.' };
  }

  const assignments = [];
  await prisma.$transaction(async (tx) => {
    await tx.emergencyRequest.update({ where: { id: requestId }, data: { is_locked: true } });

    // 1. PRE-RESET: Demote ALL previous assignments for this request to 'reserve'.
    // We MUST include ALL statuses (even 'failed') to strictly ensure only ONE primary exists.
    await tx.donorAssignment.updateMany({
      where: { request_id: requestId },
      data: { role: 'reserve' }
    });

    // 2. Assign top 2 as primary/backup, others as reserve
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
    // Notify EVERY donor in the confirmed list of their specific role.
    // This forces their UI to switch between "Navigating" and "Waiting" immediately.
    assignments.forEach(a => {
      io.to(`donor_${a.donor.user_id}`).emit('assignment_confirmed', {
        requestId,
        assignmentId: a.id,
        role:         a.role,
        hospital:     request.hospital.hospital_name,
      });
    });

    io.to(`hospital_${request.hospital.user_id}`).emit('request_status_update', {
      requestId,
      status: 'assigned',
      primary: assignments[0]?.donor?.user?.name,
      backup:  assignments[1]?.donor?.user?.name,
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
 * Re-ranks all confirmed donors and promotes the best available to Primary.
 * This is called when a primary donor fails or when a new manual promotion is requested.
 * It ensures we always have the best Rank 1 as Primary and Rank 2 as Backup.
 */
async function promoteBackupDonor(requestId, io = null) {
  return await prisma.$transaction(async (tx) => {
    // 1. Lock the request and fetch current state
    const request = await tx.emergencyRequest.findUnique({
      where: { id: requestId },
      include: { hospital: true, assignments: { include: { donor: { include: { user: true } } } } }
    });

    if (!request) throw new Error('Emergency request not found.');
    if (request.is_locked) throw new Error('Request is currently locked by another process.');

    await tx.emergencyRequest.update({
      where: { id: requestId },
      data: { is_locked: true }
    });

    // 2. Gather all donors who confirmed availability (from NotificationToken)
    const confirmedTokens = await tx.notificationToken.findMany({
      where: { 
        request_id: requestId, 
        status: { in: ['confirmed', 'responded'] } 
      },
      include: { 
        donor: { 
          include: { 
            user: true, 
            assignments: { where: { request_id: requestId } } 
          } 
        } 
      }
    });

    // Filter out donors who are marked as 'failed', 'rejected', 'cancelled', or 'arrived' in their assignments
    const eligiblePool = confirmedTokens.filter(ct => {
      const asgn = ct.donor.assignments[0];
      if (!asgn) return true; // No assignment yet = eligible
      return !['failed', 'rejected', 'cancelled', 'arrived', 'completed'].includes(asgn.status);
    });

    if (eligiblePool.length === 0) {
      console.warn(`[promoteBackupDonor] No eligible donors found for request ${requestId}`);
      await tx.emergencyRequest.update({ where: { id: requestId }, data: { is_locked: false } });
      throw new Error('No eligible donors available for promotion.');
    }

    // 3. Re-calculate scores for the eligible pool (using live GPS if available)
    const candidates = await Promise.all(eligiblePool.map(async (ct) => {
      // Fetch latest live location ping
      const lastPing = await tx.donorLocation.findFirst({
        where: { donor_id: ct.donor_id, request_id: requestId },
        orderBy: { recorded_at: 'desc' }
      });

      const donorLat = lastPing?.latitude  || ct.donor.latitude;
      const donorLng = lastPing?.longitude || ct.donor.longitude;

      if (!donorLat || !donorLng) return null;

      const dist = haversineDistance(
        request.request_lat || request.hospital.latitude,
        request.request_lng || request.hospital.longitude,
        donorLat,
        donorLng
      );

      const respondedAt  = ct.responded_at || new Date();
      const minutesTaken = Math.max(0.1, (new Date(respondedAt) - new Date(ct.created_at)) / 60000);
      
      return {
        donor: ct.donor,
        distance_km: dist,
        responseSpeed: 1 / minutesTaken,
        donationCount: ct.donor.donation_count || 0,
      };
    }));

    const validCandidates = candidates.filter(c => c !== null);

    // Normalize and score
    if (validCandidates.length === 0) {
      await tx.emergencyRequest.update({ where: { id: requestId }, data: { is_locked: false } });
      throw new Error('No candidates found after processing pool.');
    }

    const speeds    = validCandidates.map(c => c.responseSpeed);
    const dists     = validCandidates.map(c => 1 / Math.max(0.1, c.distance_km));
    const histories = validCandidates.map(c => c.donationCount);
    
    const range = {
      minSpeed: Math.min(...speeds), maxSpeed: Math.max(...speeds),
      minDist:  Math.min(...dists),  maxDist:  Math.max(...dists),
      minHistory: Math.min(...histories), maxHistory: Math.max(...histories),
    };

    const scored = validCandidates.map(c => ({
      ...c,
      score: parseFloat(computeScore(c.donor, c.distance_km, c.responseSpeed, range).toFixed(4)),
    })).sort((a, b) => b.score - a.score);

    // 4. PRE-RESET: Reset ONLY the `role` field to 'reserve' for ALL assignments.
    // We remove the status filter here to strictly enforce that even if a 
    // donor was 'failed' while they were primary, they are no longer the primary.
    await tx.donorAssignment.updateMany({
      where: { request_id: requestId },
      data: { role: 'reserve' }
    });

    // 5. Assign new roles: only top-1 becomes primary, top-2 becomes backup, rest stay reserve
    const finalAssignments = [];
    for (let i = 0; i < Math.min(scored.length, 10); i++) {
      const candidate = scored[i];
      const rank = i + 1;
      let role = 'reserve';
      let newStatus = 'accepted'; // Keep accepted for all ranked donors

      if (rank === 1) {
        role = 'primary';
        newStatus = 'accepted';
      } else if (rank === 2) {
        role = 'backup';
        newStatus = 'accepted';
      }

      // SAFETY CHECK: Skip if this candidate has a failed/rejected assignment
      const existingAsgn = candidate.donor.assignments?.[0];
      if (existingAsgn && ['failed', 'rejected', 'cancelled'].includes(existingAsgn.status)) {
        console.warn(`[promoteBackupDonor] Skipping failed donor ${candidate.donor.id} during upsert`);
        continue;
      }

      const asgn = await tx.donorAssignment.upsert({
        where: { request_id_donor_id: { request_id: requestId, donor_id: candidate.donor.id } },
        create: {
          request_id: requestId,
          donor_id:   candidate.donor.id,
          role:       role,
          status:     newStatus,
          score:      candidate.score,
          distance_km: candidate.distance_km,
        },
        update: { 
          role:   role, 
          status: newStatus,
          score:  candidate.score,
          distance_km: candidate.distance_km
        },
        include: { donor: { include: { user: true } } }
      });
      finalAssignments.push(asgn);
    }

    if (finalAssignments.length === 0) {
      await tx.emergencyRequest.update({ where: { id: requestId }, data: { is_locked: false } });
      throw new Error('No valid candidates after safety filtering.');
    }

    // 5. Update Request Status & Unlock
    await tx.emergencyRequest.update({ 
      where: { id: requestId }, 
      data: { status: 'in_transit', is_locked: false } 
    });

    // 6. Socket Notifications
    if (io) {
      const primary = finalAssignments.find(a => a.role === 'primary');
      const backup  = finalAssignments.find(a => a.role === 'backup');

      if (primary) {
        // Notify new primary donor about promotion — include full navigation data
        io.to(`donor_${primary.donor.user.id}`).emit('promoted_to_primary', {
          requestId,
          message: 'You have been promoted to PRIMARY donor! Navigate to the hospital now.',
          hospital:        request.hospital.hospital_name,
          hospitalAddress: request.hospital.address,
          hospitalLat:     request.request_lat || request.hospital.latitude,
          hospitalLng:     request.request_lng || request.hospital.longitude,
          hospitalPhone:   request.hospital.phone,
          bloodGroup:      request.blood_group,
          emergencyLevel:  request.emergency_level,
          unitsRequired:   request.units_required,
          distanceKm:      primary.distance_km,
        });

        // Notify hospital of the new primary donor (including backup info)
        io.to(`hospital_${request.hospital.user_id}`).emit('new_primary_promoted', {
          requestId,
          donorId:      primary.donor_id,
          donorUserId:  primary.donor.user.id,
          donorName:    primary.donor.user.name,
          donorPhone:   primary.donor.user.phone,
          distanceKm:   primary.distance_km,
          newBackup:    backup?.donor?.user?.name || 'Searching...',
          status:      'in_transit',
          message:      `Emergency updated: ${primary.donor.user.name} is now your primary donor.`
        });
      }

      if (backup) {
        // Use backup.donor.user.id (not donor.user_id which is undefined)
        io.to(`donor_${backup.donor.user.id}`).emit('role_update', {
          requestId,
          role: 'backup',
          message: 'You are now the secondary backup donor.',
          hospital: request.hospital.hospital_name,
        });
      }

      // Notify ALL other donors in the pool of their role (especially demotions to reserve)
      finalAssignments.forEach(asgn => {
        if (asgn.role !== 'primary' && asgn.role !== 'backup') {
          io.to(`donor_${asgn.donor.user.id}`).emit('role_update', {
            requestId,
            role: 'reserve',
            message: 'A primary donor has been assigned. You are now in reserve.',
            hospital: request.hospital.hospital_name,
          });
        }
      });
      
      io.to('admin').emit('failover_alert', { requestId, newPrimaryId: primary?.donor.id });
    }

    return finalAssignments[0];
  });
}

module.exports = { 
  findTop10Donors, 
  rankConfirmedDonors, 
  initiateEmergencySearch, 
  finalizeEmergencyAssignment,
  assignDonors, 
  promoteBackupDonor 
};
