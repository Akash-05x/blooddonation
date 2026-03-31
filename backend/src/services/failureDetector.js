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

      await Promise.all([
        checkSlowArrivals(io),
        checkGPSTimeout(io, gpsTimeoutMinutes),
        expireStaleTokens(),
        expireOldRequests(io),
        check24HourTimeouts(io),
        checkRequestTimeout30Mins(io),
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
 * Detect PRIMARY donors IN_TRANSIT with no GPS update for > gpsTimeoutMinutes.
 */
async function checkGPSTimeout(io, gpsTimeoutMinutes) {
  // Find active in_transit requests
  const inTransitRequests = await prisma.emergencyRequest.findMany({
    where:   { status: 'in_transit' },
    include: { assignments: { where: { role: 'primary', status: 'accepted' } } },
  });

  const cutoffTime = new Date(Date.now() - gpsTimeoutMinutes * 60 * 1000);

  for (const req of inTransitRequests) {
    const primaryAssignment = req.assignments[0];
    if (!primaryAssignment) continue;

    // Check last GPS update for this donor + request
    const lastLocation = await prisma.donorLocation.findFirst({
      where: {
        donor_id:   primaryAssignment.donor_id,
        request_id: req.id,
      },
      orderBy: { recorded_at: 'desc' },
    });

    // If no location ever recorded, or last update is older than timeout
    const hasGPSTimeout = !lastLocation || new Date(lastLocation.recorded_at) < cutoffTime;
    if (!hasGPSTimeout) continue;

    console.log(`[FailureDetector] 📡 GPS timeout detected for request ${req.id}`);

    // Notify hospital of GPS failure
    if (io && req.hospital_id) {
      const hospital = await prisma.hospital.findUnique({ where: { id: req.hospital_id } });
      if (hospital) {
        io.to(`hospital_${hospital.user_id}`).emit('gps_timeout', {
          requestId:   req.id,
          message:     'Donor GPS signal lost. Initiating failover...',
          donorId:     primaryAssignment.donor_id,
        });
      }
    }

    // Mark primary as failed
    await prisma.donorAssignment.update({
      where: { id: primaryAssignment.id },
      data:  { status: 'failed' },
    });

    await runFailover(req.id, io, 'gps_timeout');
  }
}

// ─── Failover Handler ─────────────────────────────────────────────────────────
/**
 * Promotes backup → primary, attempts to find a new secondary from ranked donors.
 */
async function runFailover(requestId, io, reason) {
  try {
    await promoteBackupDonor(requestId, io);
    console.log(`[FailureDetector] ✅ Failover (${reason}) complete for request ${requestId}`);
  } catch (err) {
    console.warn(`[FailureDetector] ⚠️ No backup for ${requestId}:`, err.message);

    // No backup — revert to awaiting_confirmation state so hospital can take action
    await prisma.emergencyRequest.update({
      where: { id: requestId },
      data:  { status: 'failed' },
    });

    // Notify hospital
    const request = await prisma.emergencyRequest.findUnique({
      where:   { id: requestId },
      include: { hospital: true },
    });
    if (io && request?.hospital) {
      io.to(`hospital_${request.hospital.user_id}`).emit('request_failed', {
        requestId,
        message: 'No available backup donors. Please submit a new request.',
      });
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

// ─── Check 4: 30-Minute Request Timeout ──────────────────────────────────────
/**
 * Mark any request pending (no donor assigned) since > 30 mins as failed.
 */
async function checkRequestTimeout30Mins(io) {
  try {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    const staleRequests = await prisma.emergencyRequest.findMany({
      where: {
        status: {
          in: ['created', 'active', 'donor_search', 'awaiting_confirmation', 'awaiting_assignment'],
        },
        created_at: { lt: cutoff },
      },
      include: { hospital: true },
    });

    for (const req of staleRequests) {
      console.log(`[FailureDetector] ⌛ 30m timeout detected for request ${req.id}`);

      // Mark request as failed
      await prisma.emergencyRequest.update({
        where: { id: req.id },
        data:  { status: 'failed' },
      });

      // Notify hospital via socket
      if (io && req.hospital?.user_id) {
        io.to(`hospital_${req.hospital.user_id}`).emit('request_timeout', {
          requestId: req.id,
          message:   `Sorry, no donor was assigned to your emergency request #${req.id.substring(0,8).toUpperCase()} within 30 minutes. The request has been closed automatically.`,
        });
      }

      // Fail any pending assignments
      await prisma.donorAssignment.updateMany({
        where: {
          request_id: req.id,
          status:     'pending',
        },
        data: { status: 'failed' },
      });
    }
  } catch (err) {
    console.error('[FailureDetector] Error in checkRequestTimeout30Mins:', err.message);
  }
}

function stopFailureDetector() {
  if (failureDetectorInterval) {
    clearInterval(failureDetectorInterval);
    failureDetectorInterval = null;
    console.log('[FailureDetector] Stopped.');
  }
}

module.exports = { startFailureDetector, stopFailureDetector, checkRequestTimeout30Mins };
