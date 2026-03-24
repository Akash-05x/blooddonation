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

        // Persist GPS to DonorLocation table
        const donor = await prisma.donor.findUnique({ where: { user_id: userId } });
        if (!donor) return;

        await prisma.donorLocation.create({
          data: {
            donor_id:   donor.id,
            request_id: requestId,
            latitude:   parseFloat(latitude),
            longitude:  parseFloat(longitude),
          },
        });

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

        const locationPayload = {
          donorUserId: userId,
          requestId,
          latitude:    parseFloat(latitude),
          longitude:   parseFloat(longitude),
          timestamp:   new Date().toISOString(),
        };

        // Broadcast to hospital
        io.to(`hospital_${request.hospital.user_id}`).emit('donor_location_update', locationPayload);

        // Broadcast to secondary (backup) donor
        const secondary = request.assignments.find(a => a.role === 'backup');
        if (secondary?.donor?.user_id) {
          io.to(`donor_${secondary.donor.user_id}`).emit('donor_location_update', locationPayload);
        }

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
        io.to(`role_donor`).emit('request_cancelled', { requestId });
        io.to('admin').emit('request_cancelled', { requestId });
      } catch (err) {
        console.error('[Socket] cancel_request error:', err.message);
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

/** Tell a hospital + secondary donor that tracking has stopped */
function emitTrackingStop(io, hospitalUserId, requestId) {
  io.to(`hospital_${hospitalUserId}`).emit('tracking_stopped', { requestId });
  io.to('admin').emit('tracking_stopped', { requestId });
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
  emitFailoverAlert,
};
