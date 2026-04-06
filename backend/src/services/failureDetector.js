/**
 * Failure Detector Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Background worker that polls for:
 *  1. PRIMARY donors that accepted but haven't arrived within 15 minutes
 *  2. PRIMARY donors IN_TRANSIT with no GPS update for > N minutes (GPS timeout)
 *
 * On detection → auto-promote backup donor → emit socket alerts
 */

const prisma = require('../config/prisma');
const { promoteBackupDonor } = require('./donorRanking');
const { haversineDistance } = require('../utils/haversine');

let failureDetectorInterval = null;

/**
 * Starts the background failure detection worker.
 * Runs every 30 seconds, checking for two failure conditions.
 *
 * @param {import('socket.io').Server} io - Socket.io instance for emitting alerts
 */
function startFailureDetector(io) {
  if (failureDetectorInterval) return;

  failureDetectorInterval = setInterval(async () => {
    try {
      // Fetch system config for GPS timeout setting
      const sysConfig = await prisma.systemConfiguration.findFirst();
      const gpsTimeoutMinutes = sysConfig?.gps_timeout_minutes ?? 2;
      console.log(`[FailureDetector] 💓 Heartbeat: ${new Date().toISOString()}`);

      await Promise.all([
        checkSlowArrivals(io),
        checkGPSTimeout(io, gpsTimeoutMinutes),
        expireStaleTokens(),
        expireOldRequests(io),
        check24HourTimeouts(io),
        checkAutoFinalization(io),
      ]);
    } catch (err) {
      console.error('[FailureDetector] Error:', err.message);
    }
  }, 30_000); // every 30 seconds

  console.log('[FailureDetector] ✅ Started automated failure detection worker');
}

// ─── Check 1: Slow Arrivals ──────────────────────────────────────────────────
/**
 * Find PRIMARY donors that accepted but haven't arrived within 15 minutes.
 */
async function checkSlowArrivals(io) {
  const expiredPrimaries = await prisma.donorAssignment.findMany({
    where: {
      role:       'primary',
      status:     'accepted',
      arrived_at: null,
      responded_at: {
        lt: new Date(Date.now() - 15 * 60 * 1000), // >15 min since acceptance
      },
      request: { status: { in: ['assigned', 'in_transit'] } },
    },
    include: { donor: true, request: { include: { hospital: true } } },
  });

  for (const assignment of expiredPrimaries) {
    console.log(`[FailureDetector] ⏰ Slow arrival detected — assignment ${assignment.id}`);

    // Mark primary as failed
    await prisma.donorAssignment.update({
      where: { id: assignment.id },
      data:  { status: 'failed' },
    });

    // Penalize reliability score
    await prisma.donor.update({
      where: { id: assignment.donor_id },
      data:  { reliability_score: { decrement: 10 } },
    });

    await runFailover(assignment.request_id, io, 'slow_arrival');
  }
}

// ─── Check 2: GPS Timeout ────────────────────────────────────────────────────
/**
 * Detect PRIMARY donors in 'assigned' OR 'in_transit' with no GPS update
 * for > gpsTimeoutMinutes. Checking 'assigned' is critical: if a donor turns
 * off GPS right after accepting but before sending any location, the status
 * never moves to 'in_transit' and failover would be missed without this check.
 */
async function checkGPSTimeout(io, defaultTimeout) {
  // Find active requests where donor should be navigating
  const inTransitRequests = await prisma.emergencyRequest.findMany({
    where:   { status: { in: ['assigned', 'in_transit'] } },
    include: { 
      assignments: { where: { role: 'primary', status: { in: ['accepted', 'pending'] } } },
      hospital: true 
    },
  });

  const sysConfig = await prisma.systemConfiguration.findFirst();
  const gpsTimeoutMinutes = sysConfig?.gps_timeout_minutes ?? defaultTimeout ?? 5; // Default to 5m instead of 2m
  const gpsCutoff = new Date(Date.now() - gpsTimeoutMinutes * 60 * 1000);
  const stationaryCutoff = new Date(Date.now() - 5 * 60 * 1000); // 5m for no-move check

  for (const req of inTransitRequests) {
    const primaryAssignment = req.assignments[0];
    if (!primaryAssignment) continue;

    // Fetch last 2 locations for movement validation
    const locations = await prisma.donorLocation.findMany({
      where: {
        donor_id:   primaryAssignment.donor_id,
        request_id: req.id,
      },
      orderBy: { recorded_at: 'desc' },
      take: 2
    });

    const lastLocation = locations[0];
    const prevLocation = locations[1];

    // 1. Heartbeat Failure (GPS TIMEOUT)
    // If no locations exist yet, we check the assigned_time to give them a grace period.
    const lastUpdate = lastLocation ? new Date(lastLocation.recorded_at) : new Date(primaryAssignment.assigned_time);
    const hasGPSTimeout = lastUpdate < gpsCutoff;
    
    // 2. No Movement Detection (threshold: 50 meters in 5 minutes)
    let hasNoMovement = false;
    if (lastLocation && prevLocation) {
      const timeSpanMs = new Date(lastLocation.recorded_at) - new Date(prevLocation.recorded_at);
      const timeSinceLastMs = Date.now() - new Date(lastLocation.recorded_at);
      
      const distBetween = haversineDistance(
        lastLocation.latitude, lastLocation.longitude,
        prevLocation.latitude, prevLocation.longitude
      );

      // Trigger if they haven't moved > 50m AND the last update was > 5m ago, 
      // OR they've sent multiple updates in a > 5m window that were all $< 50m apart.
      if (distBetween < 0.05 && (timeSpanMs > 300_000 || timeSinceLastMs > 300_000)) {
        hasNoMovement = true;
      }
    }

    // 3. Excessive Delay (Simplified ETA Check: if current distance > 2x original distance)
    let hasExcessiveDelay = false;
    if (lastLocation && primaryAssignment.distance_km) {
      const currentDist = haversineDistance(
        lastLocation.latitude, lastLocation.longitude,
        req.hospital.latitude, req.hospital.longitude
      );
      // If donor is moving away significantly or taking too long
      if (currentDist > primaryAssignment.distance_km * 2) {
        hasExcessiveDelay = true;
      }
    }

    if (!hasGPSTimeout && !hasNoMovement && !hasExcessiveDelay) continue;

    const reason = hasGPSTimeout ? 'GPS_TIMEOUT' : (hasNoMovement ? 'STATIONARY_FAIL' : 'EXCESSIVE_DELAY');
    const details = hasGPSTimeout 
      ? `(Last update: ${lastUpdate.toISOString()}, Cutoff: ${gpsCutoff.toISOString()})`
      : (hasNoMovement ? `(Stationary for > 5m)` : `(Original distance: ${primaryAssignment.distance_km}km)`);
    
    console.log(`[FailureDetector] 🚨 Failure detected for request ${req.id}. Reason: ${reason} ${details}`);

    // Notify hospital
    if (io && req.hospital.user_id) {
      io.to(`hospital_${req.hospital.user_id}`).emit('failover_alert', {
        requestId:   req.id,
        reason:      reason,
        message:     `Failure detected (${reason}). Initiating failover...`,
      });
    }

    await runFailover(req.id, io, reason, primaryAssignment.donor_id);
  }
}

// ─── Failover Handler ─────────────────────────────────────────────────────────
/**
 * Promotes backup → primary, attempts to find a new secondary from ranked donors.
 */
async function runFailover(requestId, io, reason, failedDonorId) {
  try {
    // 1. Acquire Lock & Mark Failure
    await prisma.$transaction(async (tx) => {
      const request = await tx.emergencyRequest.findUnique({
        where: { id: requestId },
        select: { id: true, is_locked: true, hospital_id: true }
      });

      if (request.is_locked) return;

      // Lock the request
      await tx.emergencyRequest.update({
        where: { id: requestId },
        data: { is_locked: true }
      });

      // Mark assignment as failed
      await tx.donorAssignment.updateMany({
        where: { request_id: requestId, donor_id: failedDonorId },
        data: { status: 'failed' }
      });

      // Create Donation History record for the failure
      await tx.donationHistory.create({
        data: {
          donor_id:    failedDonorId,
          hospital_id: request.hospital_id,
          request_id:  requestId,
          status:      'failed',
          notes:       `Donor failed during IN_TRANSIT. Reason: ${reason}`
        }
      });

      // Penalize reliability score
      await tx.donor.update({
        where: { id: failedDonorId },
        data: { reliability_score: { decrement: 10 } }
      });

      // Unlock
      await tx.emergencyRequest.update({
        where: { id: requestId },
        data: { is_locked: false }
      });
    });

    // 2. Promote backup
    await promoteBackupDonor(requestId, io);
    console.log(`[FailureDetector] ✅ Failover (${reason}) complete for request ${requestId}`);

  } catch (err) {
    console.warn(`[FailureDetector] ⚠️ No backup for ${requestId}:`, err.message);

    // No backup — do NOT fail request. Revert to 'donor_search' to find fresh donors
    await prisma.emergencyRequest.update({
      where: { id: requestId },
      data:  { status: 'donor_search', is_locked: false },
    });

    // Notify hospital that we are searching again
    const request = await prisma.emergencyRequest.findUnique({
      where:   { id: requestId },
      include: { hospital: true },
    });
    if (io && request?.hospital) {
      io.to(`hospital_${request.hospital.user_id}`).emit('failover_alert', {
        requestId,
        reason: reason || 'FAILOVER_EMPTY',
        message: 'Primary donor failed and no immediate backup available. Re-initiating search for fresh donors...',
      });
      io.to(`hospital_${request.hospital.user_id}`).emit('request_status_update', {
        requestId,
        status: 'donor_search',
      });
    }

    // Auto-restart search
    const { initiateEmergencySearch } = require('./donorRanking');
    try {
      await initiateEmergencySearch(requestId, io);
    } catch (searchErr) {
      console.error('[FailureDetector] Failed to restart search:', searchErr.message);
      // Only now, if search fails (no donors globally), do we fail the request
      await prisma.emergencyRequest.update({
        where: { id: requestId },
        data:  { status: 'failed' },
      });
      if (io && request?.hospital) {
        io.to(`hospital_${request.hospital.user_id}`).emit('request_failed', {
          requestId,
          message: 'No eligible donors left in the system to replace the primary donor.',
        });
      }
    }
  }
}

// ─── Expire Stale Notification Tokens ────────────────────────────────────────
async function expireStaleTokens() {
  const result = await prisma.notificationToken.updateMany({
    where:  { status: 'pending', expires_at: { lt: new Date() } },
    data:   { status: 'expired' },
  });
  if (result.count > 0) {
    console.log(`[FailureDetector] 🗑️ Expired ${result.count} stale notification tokens.`);
  }
}

// ─── Expire Old Requests ──────────────────────────────────────────────────────
async function expireOldRequests(io) {
  // Expire requests that have been awaiting_confirmation for > 15 minutes
  const expired = await prisma.emergencyRequest.findMany({
    where: {
      status:     'awaiting_confirmation',
      updated_at: { lt: new Date(Date.now() - 15 * 60 * 1000) },
    },
    include: { hospital: true },
  });

  for (const req of expired) {
    await prisma.emergencyRequest.update({
      where: { id: req.id },
      data:  { status: 'expired' },
    });
    if (io && req.hospital) {
      io.to(`hospital_${req.hospital.user_id}`).emit('request_expired', {
        requestId: req.id,
        message:   'Emergency request expired — no donors confirmed in time.',
      });
    }
    console.log(`[FailureDetector] ⌛ Request ${req.id} expired (no donor confirmation).`);
  }
}

// ─── Check 3: 24-Hour Timeout ────────────────────────────────────────────────
/**
 * Mark any unresolved request (pending since > 24h) as failed.
 */
async function check24HourTimeouts(io) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const staleRequests = await prisma.emergencyRequest.findMany({
    where: {
      status: {
        notIn: ['completed', 'closed', 'failed', 'cancelled', 'expired'],
      },
      created_at: { lt: cutoff },
    },
    include: { hospital: true },
  });

  for (const req of staleRequests) {
    console.log(`[FailureDetector] 🚨 24h timeout detected for request ${req.id}`);

    // Mark request as failed
    await prisma.emergencyRequest.update({
      where: { id: req.id },
      data:  { status: 'failed' },
    });

    // Notify hospital via socket
    if (io && req.hospital) {
      io.to(`hospital_${req.hospital.user_id}`).emit('request_failed', {
        requestId: req.id,
        message:   'Emergency request failed — timeout exceeded (24 hours).',
      });
    }

    // Cancel all associated assignments if they were pending/accepted
    await prisma.donorAssignment.updateMany({
      where: {
        request_id: req.id,
        status:     { in: ['pending', 'accepted'] },
      },
      data: { status: 'failed' },
    });
  }
}

// ─── Check 5: Auto-Finalization (2 Minutes) ──────────────────────────────────
/**
 * Automatically finalizes donors for requests that have been 'awaiting_confirmation'
 * for more than 2 minutes.
 */
async function checkAutoFinalization(io) {
  try {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes — giving hospital more manual control time
    const pendingRequests = await prisma.emergencyRequest.findMany({
      where: {
        status: { in: ['created', 'active', 'donor_search', 'awaiting_confirmation'] },
        created_at: { lt: cutoff },
      },
      include: { hospital: true },
    });

    for (const req of pendingRequests) {
      const ageInSeconds = Math.floor((Date.now() - new Date(req.created_at).getTime()) / 1000);
      console.log(`[AutoFinalize] 🕒 Processing request ${req.id} (status: ${req.status}, age: ${ageInSeconds}s)`);

      const { finalizeEmergencyAssignment } = require('./donorRanking');
      const result = await finalizeEmergencyAssignment(req.id, io);

      if (!result.success) {
        console.log(`[AutoFinalize] ❌ No donors responded for request ${req.id}. Failing...`);
        
        await prisma.emergencyRequest.update({
          where: { id: req.id },
          data: { status: 'failed' }
        });

        if (io && req.hospital?.user_id) {
          io.to(`hospital_${req.hospital.user_id}`).emit('request_failed', {
            requestId: req.id,
            message: "no donors available now",
          });
        }
      } else {
        console.log(`[AutoFinalize] ✅ Request ${req.id} auto-finalized.`);
        if (io && req.hospital?.user_id) {
          io.to(`hospital_${req.hospital.user_id}`).emit('request_finalized', {
            requestId: req.id,
            message: 'Donor assignment finalized automatically.',
          });
        }
      }
    }
  } catch (err) {
    console.error('[FailureDetector] Error in checkAutoFinalization:', err.message);
  }
}

function stopFailureDetector() {
  if (failureDetectorInterval) {
    clearInterval(failureDetectorInterval);
    failureDetectorInterval = null;
    console.log('[FailureDetector] Stopped.');
  }
}

module.exports = { startFailureDetector, stopFailureDetector, checkAutoFinalization };
