/**
 * Socket.io event hub
 * ─────────────────────────────────────────────────────────────────────────────
 * Sets up all real-time communication channels between hospitals, donors, admin.
 *
 * Room naming:
 *   donor_<userId>        — individual donor room
 *   hospital_<userId>     — individual hospital room
 *   role_donor            — all donors broadcast
 *   role_hospital         — all hospitals broadcast
 *   admin                 — all admins
 */

const { verifyToken } = require('../utils/jwt');
const prisma           = require('../config/prisma');
const { promoteBackupDonor } = require('../services/donorRanking');
const { haversineDistance } = require('../utils/haversine');

/**
 * Initialize Socket.io with the HTTP server
 * @param {import('socket.io').Server} io
 */
function initSockets(io) {
  // ── JWT Authentication middleware ────────────────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const decoded = verifyToken(token);
      socket.user   = decoded;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const { id: userId, role } = socket.user;
    console.log(`[Socket] Connected: ${userId} (${role})`);

    // ── Join role-based rooms ─────────────────────────────────────────────────
    socket.join(`${role}_${userId}`);   // e.g. "donor_<userId>", "hospital_<userId>"
    socket.join(`role_${role}`);        // broadcast room for all donors / hospitals
    if (role === 'admin') socket.join('admin');

    // ── Donor: GPS Location Update ────────────────────────────────────────────
    // Donor emits: { requestId, latitude, longitude }
    socket.on('donor_location_update', async (data) => {
      try {
        const { requestId, latitude, longitude } = data;
        if (!requestId || latitude == null || longitude == null) return;

        // Persist GPS to DonorLocation history table
        const donor = await prisma.donor.findUnique({ where: { user_id: userId } });
        if (!donor) return;

        const distToHospital = request.hospital ? haversineDistance(
          latitude, longitude,
          request.hospital.latitude, request.hospital.longitude
        ) : 0;

        // ETA calculation: simple 40km/h average = 1.5 mins per km
        const etaMinutes = Math.ceil(distToHospital * 1.5);
        const expectedArrivalAt = new Date(Date.now() + etaMinutes * 60 * 1000);

        await Promise.all([
          prisma.donorLocation.create({
            data: {
              donor_id:   donor.id,
              request_id: requestId,
              latitude:   parseFloat(latitude),
              longitude:  parseFloat(longitude),
            },
          }),
          // UPDATE: Sync live GPS to main Donor table for accurate nearby search
          prisma.donor.update({
            where: { id: donor.id },
            data: {
              latitude:  parseFloat(latitude),
              longitude: parseFloat(longitude),
            },
          }),
          // UPDATE Requirement 6: Track heartbeat and ETA in assignment
          prisma.donorAssignment.update({
            where: { request_id_donor_id: { request_id: requestId, donor_id: donor.id } },
            data: {
              last_heartbeat_at: new Date(),
              expected_arrival_at: expectedArrivalAt,
            }
          })
        ]);

        // Fetch request to find hospital + secondary donor
        const request = await prisma.emergencyRequest.findUnique({
          where:   { id: requestId },
          include: {
            hospital:    true,
            assignments: {
              where:   { status: { in: ['pending', 'accepted'] } },
              include: { donor: { include: { user: true } } },
            },
          },
        });
        if (!request) return;

        // ── KEY FIX: Transition 'assigned' → 'in_transit' on first GPS ping ─────
        // This ensures checkGPSTimeout can monitor the donor immediately. Without
        // this, the request stays 'assigned' and the GPS poller never fires.
        if (request.status === 'assigned') {
          const isPrimaryDonor = request.assignments?.some(
            a => a.donor?.user_id === userId && a.role === 'primary' && a.status !== 'failed'
          );
          if (isPrimaryDonor) {
            await prisma.emergencyRequest.update({
              where: { id: requestId },
              data:  { status: 'in_transit' },
            });
            io.to(`hospital_${request.hospital.user_id}`).emit('request_status_update', {
              requestId,
              status: 'in_transit',
            });
            io.to('admin').emit('request_status_update', { requestId, status: 'in_transit' });
            console.log(`[Socket] 🚗 Request ${requestId} transitioned assigned → in_transit (first GPS ping)`);
          }
        }

        const locationPayload = {
          donorUserId: userId,
          requestId,
          latitude:    parseFloat(latitude),
          longitude:   parseFloat(longitude),
          etaMinutes:  etaMinutes,
          expectedArrivalAt: expectedArrivalAt.toISOString(),
          timestamp:   new Date().toISOString(),
        };

        // Broadcast to hospital
        io.to(`hospital_${request.hospital.user_id}`).emit('donor_location_update', locationPayload);

        // Admin visibility
        io.to('admin').emit('donor_location_update', locationPayload);
      } catch (err) {
        console.error('[Socket] donor_location_update error:', err.message);
      }
    });

    // ── Donor: Heartbeat / Ping ───────────────────────────────────────────────
    socket.on('ping', () => socket.emit('pong', { time: Date.now() }));

    // ── Hospital: Manual Cancel Request ──────────────────────────────────────
    socket.on('cancel_request', async ({ requestId }) => {
      try {
        await prisma.emergencyRequest.update({
          where: { id: requestId },
          data:  { status: 'cancelled' },
        });

        // Notify all donors associated with this request specifically (Requirement Fix)
        const allAssignments = await prisma.donorAssignment.findMany({
          where: { request_id: requestId },
          include: { donor: { select: { user_id: true } } }
        });
        const donorUserIds = [...new Set(allAssignments.map(a => a.donor?.user_id).filter(Boolean))];
        emitRequestCompleted(io, userId, donorUserIds, requestId);


      } catch (err) {
        console.error('[Socket] cancel_request error:', err.message);
      }
    });

    // ── Donor: GPS Failure → Immediate Failover ───────────────────────────────
    // Donor emits this when watchPosition fails critically (permission denied, hardware error)
    socket.on('gps_failure', async ({ requestId, reason }) => {
      if (role !== 'donor') return;
      try {
        const donor = await prisma.donor.findUnique({ where: { user_id: userId } });
        if (!donor) return;

        // Find the PRIMARY assignment for this donor on this request.
        // Include both 'accepted' AND 'pending' — after initial finalization the
        // primary's status starts as 'pending' until they explicitly accept the app push.
        const assignment = await prisma.donorAssignment.findFirst({
          where: { 
            request_id: requestId, 
            donor_id: donor.id, 
            role: 'primary',
            status: { in: ['accepted', 'pending'] }
          },
          include: { request: { include: { hospital: true } } }
        });

        if (!assignment) return; // Not the primary donor, ignore

        // GRACE PERIOD: If donor was assigned < 2 minutes ago, ignore "TIMEOUT" style failures.
        // They might still be indoor or starting the app.
        const assignmentAgeMs = Date.now() - new Date(assignment.assigned_time).getTime();
        if (assignmentAgeMs < 300_000) {
          console.log(`[Socket] 🛡️ Ignoring GPS Failure for request ${requestId} — donor is still in 2-min grace period.`);
          return;
        }

        console.log(`[Socket] ⚡ GPS Failure reported by primary donor ${userId} for request ${requestId}. Immediate failover.`);

        // Notify hospital immediately
        if (assignment.request?.hospital?.user_id) {
          io.to(`hospital_${assignment.request.hospital.user_id}`).emit('failover_alert', {
            requestId,
            reason: reason || 'GPS_FAILURE',
            message: 'Primary donor GPS failed. Initiating emergency promotion...',
          });
        }

        // Mark assignment as failed
        await prisma.donorAssignment.update({
          where: { id: assignment.id },
          data: { status: 'failed' }
        });

        try {
          await promoteBackupDonor(requestId, io);
          console.log(`[Socket] ✅ Immediate failover complete for request ${requestId}`);
        } catch (promoteErr) {
          console.warn('[Socket] No backup available to promote, restarting search...', promoteErr.message);
          
          await prisma.emergencyRequest.update({
            where: { id: requestId },
            data: { status: 'donor_search' }
          });
          
          io.to(`hospital_${assignment.request.hospital.user_id}`).emit('request_status_update', {
            requestId,
            status: 'donor_search',
          });

          // Restart search
          const { initiateEmergencySearch } = require('../services/donorRanking');
          try {
            await initiateEmergencySearch(requestId, io);
          } catch (searchErr) {
            await prisma.emergencyRequest.update({
              where: { id: requestId },
              data: { status: 'failed' }
            });
            io.to(`hospital_${assignment.request.hospital.user_id}`).emit('request_failed', {
              requestId,
              message: 'Primary donor GPS failed and no eligible donors left in the system.'
            });
          }
        }

      } catch (err) {
        console.error('[Socket] gps_failure handler error:', err.message);
      }
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Disconnected: ${userId} (${role}) — ${reason}`);
    });
  });

  console.log('[Socket.io] ✅ Real-time server initialized');
  return io;
}

// ─── Emit Helpers ─────────────────────────────────────────────────────────────

/** Notify a listing of donors of a new emergency */
function emitEmergencyAlert(io, donorUserIds, payload) {
  donorUserIds.forEach(uid => io.to(`donor_${uid}`).emit('new_emergency', payload));
  io.to('admin').emit('new_emergency', payload);
}

/** Notify a hospital that a donor accepted/rejected */
function emitDonorResponse(io, hospitalUserId, event, payload) {
  io.to(`hospital_${hospitalUserId}`).emit(event, payload);
  io.to('admin').emit(event, payload);
}

/** Broadcast a request status update to hospital + admin */
function emitRequestStatusUpdate(io, hospitalUserId, payload) {
  io.to(`hospital_${hospitalUserId}`).emit('request_status_update', payload);
  io.to('admin').emit('request_status_update', payload);
}

/** Tell a hospital + donors + admin that tracking has stopped (e.g. arrival) */
function emitTrackingStop(io, hospitalUserId, donorUserIds, requestId) {
  if (Array.isArray(donorUserIds)) {
    donorUserIds.forEach(uid => io.to(`donor_${uid}`).emit('tracking_stopped', { requestId }));
  } else if (donorUserIds) {
    io.to(`donor_${donorUserIds}`).emit('tracking_stopped', { requestId });
  }
  io.to(`hospital_${hospitalUserId}`).emit('tracking_stopped', { requestId });
  io.to('admin').emit('tracking_stopped', { requestId });
}

/** Notify hospital + donor + admin that the entire request is COMPLETED */
function emitRequestCompleted(io, hospitalUserId, donorUserIds, requestId) {
  if (Array.isArray(donorUserIds)) {
    donorUserIds.forEach(uid => io.to(`donor_${uid}`).emit('request_completed', { requestId }));
  } else if (donorUserIds) {
    io.to(`donor_${donorUserIds}`).emit('request_completed', { requestId });
  }
  io.to(`hospital_${hospitalUserId}`).emit('request_completed', { requestId });
  io.to('admin').emit('request_completed', { requestId });
}

/** Emit a failover/promotion alert */
function emitFailoverAlert(io, hospitalUserId, payload) {
  io.to(`hospital_${hospitalUserId}`).emit('failover_alert', payload);
  io.to('admin').emit('failover_alert', payload);
}

module.exports = {
  initSockets,
  emitEmergencyAlert,
  emitDonorResponse,
  emitRequestStatusUpdate,
  emitTrackingStop,
  emitRequestCompleted,
  emitFailoverAlert,
};

