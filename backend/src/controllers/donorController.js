/**
 * Donor Controller
 * ─────────────────────────────────────────────────────────────────────────────
 */

const prisma = require('../config/prisma');
const { promoteBackupDonor } = require('../services/donorRanking');
const { validateAndConfirmToken } = require('../services/notificationService');
const { emitDonorResponse, emitRequestStatusUpdate } = require('../sockets');

function getIO(req) { return req.app.get('io'); }

// ─── GET /api/donor/profile ──────────────────────────────────────────────────
async function getProfile(req, res, next) {
  try {
    const donor = await prisma.donor.findUnique({
      where:   { user_id: req.user.id },
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
    });
    if (!donor) return res.status(404).json({ success: false, message: 'Donor profile not found.' });
    res.json({ success: true, data: donor });
  } catch (err) { next(err); }
}

// ─── PUT /api/donor/profile ──────────────────────────────────────────────────
async function updateProfile(req, res, next) {
  try {
    const {
      name, phone, blood_group, age, medical_notes,
      availability_status, vacation_mode, latitude, longitude,
      gender, dob, body_weight, district, address,
      willing_to_travel, id_proof_type, id_proof_no,
    } = req.body;

    await prisma.user.update({
      where: { id: req.user.id },
      data:  { ...(name && { name }), ...(phone && { phone }) },
    });

    const donor = await prisma.donor.update({
      where: { user_id: req.user.id },
      data: {
        ...(blood_group          !== undefined && { blood_group }),
        ...(age                  !== undefined && { age: parseInt(age) }),
        ...(medical_notes        !== undefined && { medical_notes }),
        ...(availability_status  !== undefined && { availability_status: Boolean(availability_status) }),
        ...(vacation_mode        !== undefined && { vacation_mode: Boolean(vacation_mode) }),
        ...(latitude             !== undefined && { latitude:  parseFloat(latitude) }),
        ...(longitude            !== undefined && { longitude: parseFloat(longitude) }),
        ...(gender               !== undefined && { gender }),
        ...(dob                  !== undefined && { dob: new Date(dob) }),
        ...(body_weight          !== undefined && { body_weight: parseFloat(body_weight) }),
        ...(district             !== undefined && { district }),
        ...(address              !== undefined && { address }),
        ...(willing_to_travel    !== undefined && { willing_to_travel: Boolean(willing_to_travel) }),
        ...(id_proof_type        !== undefined && { id_proof_type }),
        ...(id_proof_no          !== undefined && { id_proof_no }),
      },
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
    });

    res.json({ success: true, message: 'Profile updated.', data: donor });
  } catch (err) { next(err); }
}

// ─── GET /api/donor/alerts ───────────────────────────────────────────────────
async function getAlerts(req, res, next) {
  try {
    const donor = await prisma.donor.findUnique({ where: { user_id: req.user.id } });
    if (!donor) return res.status(404).json({ success: false, message: 'Donor not found.' });

    const assignments = await prisma.donorAssignment.findMany({
      where: {
        donor_id: donor.id,
        status:   { in: ['pending', 'accepted'] },
        request:  { status: { in: ['awaiting_confirmation', 'assigned', 'in_transit'] } },
      },
      include: {
        request: {
          include: {
            hospital: { select: { hospital_name: true, address: true, latitude: true, longitude: true, user_id: true } },
          },
        },
      },
      orderBy: { assigned_time: 'desc' },
    });

    res.json({ success: true, data: assignments });
  } catch (err) { next(err); }
}

// ─── POST /api/donor/accept-request ─────────────────────────────────────────
async function acceptRequest(req, res, next) {
  try {
    const { assignmentId, latitude, longitude } = req.body;
    const io = getIO(req);

    const donor = await prisma.donor.findUnique({ where: { user_id: req.user.id } });
    const assignment = await prisma.donorAssignment.findFirst({
      where:   { id: assignmentId, donor_id: donor.id },
      include: { request: { include: { hospital: true } } },
    });

    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found.' });
    if (assignment.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Assignment is no longer pending.' });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Lock the request to prevent race conditions
      await tx.emergencyRequest.update({ where: { id: assignment.request_id }, data: { is_locked: true } });

      // 2. Count current accepted assignments
      const acceptedCount = await tx.donorAssignment.count({
        where: { request_id: assignment.request_id, status: 'accepted' }
      });

      if (acceptedCount >= 2) {
        throw new Error('This request has already been fulfilled by other donors.');
      }

      const assignedRole = acceptedCount === 0 ? 'primary' : 'backup';

      // 3. Update assignment and donor
      const updatedAssignment = await tx.donorAssignment.update({
        where: { id: assignmentId },
        data:  { status: 'accepted', role: assignedRole, responded_at: new Date() },
      });

      await tx.donor.update({
        where: { id: donor.id },
        data:  { last_response_time: new Date() },
      });

      if (latitude != null && longitude != null) {
        await tx.donorLocation.create({
          data: {
            donor_id: donor.id,
            request_id: assignment.request_id,
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
          }
        });
      }

      // 4. Update request status
      await tx.emergencyRequest.update({
        where: { id: assignment.request_id },
        data:  { status: 'in_transit', is_locked: false },
      });

      return { updatedAssignment, assignedRole };
    });

    emitDonorResponse(io, assignment.request.hospital.user_id, 'donor_accepted', {
      requestId:   assignment.request_id,
      donorId:     donor.id,
      donorName:   req.user.name,
      role:        result.assignedRole,
      message:     `${req.user.name || 'Donor'} has accepted your emergency request as ${result.assignedRole.toUpperCase()} and is on the way.`,
    });
    emitRequestStatusUpdate(io, assignment.request.hospital.user_id, {
      requestId: assignment.request_id,
      status:    'in_transit',
    });

    res.json({ success: true, message: 'Request accepted. Please head to the hospital.', data: { assignmentId } });
  } catch (err) { next(err); }
}

// ─── POST /api/donor/reject-request ─────────────────────────────────────────
async function rejectRequest(req, res, next) {
  try {
    const { assignmentId } = req.body;
    const io = getIO(req);

    const donor = await prisma.donor.findUnique({ where: { user_id: req.user.id } });
    const assignment = await prisma.donorAssignment.findFirst({
      where:   { id: assignmentId, donor_id: donor.id },
      include: { request: { include: { hospital: true } } },
    });
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found.' });

    await prisma.$transaction([
      prisma.donorAssignment.update({
        where: { id: assignmentId },
        data:  { status: 'rejected', responded_at: new Date() },
      }),
      // Minor penalty for rejecting
      prisma.donor.update({
        where: { id: donor.id },
        data:  { reliability_score: { decrement: 2 } },
      }),
    ]);

    emitDonorResponse(io, assignment.request.hospital.user_id, 'donor_rejected', {
      requestId: assignment.request_id,
      message:   'A donor rejected the request.',
    });

    // Auto-promote backup if primary rejected
    if (assignment.role === 'primary') {
      try {
        const promoted = await promoteBackupDonor(assignment.request_id, io);
        emitDonorResponse(io, assignment.request.hospital.user_id, 'backup_promoted', {
          requestId: assignment.request_id,
          donorName: promoted.donor?.user?.name,
          message:   'Backup donor has been promoted to primary.',
        });
      } catch {
        await prisma.emergencyRequest.update({
          where: { id: assignment.request_id },
          data:  { status: 'failed' },
        });
      }
    }

    res.json({ success: true, message: 'Request rejected.' });
  } catch (err) { next(err); }
}

// ─── GET /api/donor/history ──────────────────────────────────────────────────
async function getHistory(req, res, next) {
  try {
    const donor = await prisma.donor.findUnique({ where: { user_id: req.user.id } });
    if (!donor) return res.status(404).json({ success: false, message: 'Donor not found.' });

    const history = await prisma.donationHistory.findMany({
      where:   { donor_id: donor.id },
      include: {
        hospital: { select: { hospital_name: true, address: true } },
        request:  { select: { blood_group: true, emergency_level: true, units_required: true } },
      },
      orderBy: { donation_date: 'desc' },
    });

    const totalDonations = history.filter(h => h.status === 'successful').length;
    const totalPoints    = history.reduce((sum, h) => sum + (h.points_earned || 0), 0);
    const livesSaved     = totalDonations * 3;

    res.json({
      success: true,
      data:    history,
      stats: {
        totalDonations,
        livesSaved,
        totalPoints,
        donationCount:    donor.donation_count,
        reliabilityScore: donor.reliability_score,
      },
    });
  } catch (err) { next(err); }
}

// ─── POST /api/donor/location ────────────────────────────────────────────────
// Stores GPS ping (also handled via socket, this is the HTTP fallback)
async function updateLocation(req, res, next) {
  try {
    const { requestId, latitude, longitude } = req.body;
    if (!requestId || latitude == null || longitude == null) {
      return res.status(400).json({ success: false, message: 'requestId, latitude, longitude are required.' });
    }

    const donor = await prisma.donor.findUnique({ where: { user_id: req.user.id } });
    if (!donor) return res.status(404).json({ success: false, message: 'Donor not found.' });

    const location = await prisma.donorLocation.create({
      data: {
        donor_id:   donor.id,
        request_id: requestId,
        latitude:   parseFloat(latitude),
        longitude:  parseFloat(longitude),
      },
    });

    // Broadcast via socket if available
    const io = getIO(req);
    if (io) {
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
      if (request) {
        const payload = {
          donorUserId: req.user.id,
          requestId,
          latitude:    parseFloat(latitude),
          longitude:   parseFloat(longitude),
          timestamp:   new Date().toISOString(),
        };
        io.to(`hospital_${request.hospital.user_id}`).emit('donor_location_update', payload);
        const secondary = request.assignments.find(a => a.role === 'backup');
        if (secondary?.donor?.user_id) io.to(`donor_${secondary.donor.user_id}`).emit('donor_location_update', payload);
        io.to('admin').emit('donor_location_update', payload);
      }
    }

    res.json({ success: true, message: 'Location updated.', data: location });
  } catch (err) { next(err); }
}

// ─── POST /api/donor/confirm-token ──────────────────────────────────────────
async function confirmToken(req, res, next) {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'Token is required.' });

    const donor = await prisma.donor.findUnique({ where: { user_id: req.user.id } });
    if (!donor) return res.status(404).json({ success: false, message: 'Donor not found.' });

    const result = await validateAndConfirmToken(token, donor.id);
    if (!result.valid) {
      return res.status(400).json({ success: false, message: result.error });
    }

    // Emit to hospital in real-time
    const io = getIO(req);
    if (io && result.notificationToken?.request?.hospital?.user_id) {
      emitDonorResponse(io, result.notificationToken.request.hospital.user_id, 'donor_confirmed', {
        requestId: result.notificationToken.request_id,
        donorName: result.notificationToken.donor?.user?.name || 'A donor',
        message:   `${result.notificationToken.donor?.user?.name || 'A donor'} has confirmed availability!`,
      });
    }

    // Update donor's last response time
    await prisma.donor.update({
      where: { id: donor.id },
      data:  { last_response_time: new Date() },
    });

    res.json({
      success:    true,
      message:    'Token confirmed. You are now in the candidate pool for assignment.',
      data:       { requestId: result.notificationToken.request_id },
    });
  } catch (err) { next(err); }
}

// ─── POST /api/donor/respond ──────────────────────────────────────────────────
async function donorRespond(req, res, next) {
  try {
    const { donorId, requestId, token } = req.body;
    if (!token || !donorId || !requestId) {
      return res.status(400).json({ success: false, message: 'donorId, requestId, token are required.' });
    }

    const { validateAndConfirmToken } = require('../services/notificationService');
    const result = await validateAndConfirmToken(token, donorId);
    if (!result.valid) {
      return res.status(400).json({ success: false, message: result.error });
    }

    // Update status to RESPONDED
    await prisma.notificationToken.update({
      where: { id: result.notificationToken.id },
      data: { status: 'responded', responded_at: new Date() }
    });
    
    // Also update donor response time
    await prisma.donor.update({
      where: { id: donorId },
      data: { last_response_time: new Date() }
    });

    res.json({
      success: true,
      message: 'Response captured and status set to RESPONDED.',
      data: {
        response_timestamp: new Date(),
        status: 'RESPONDED'
      }
    });

  } catch(err) { next(err); }
}

module.exports = {
  getProfile, updateProfile, getAlerts,
  acceptRequest, rejectRequest, getHistory,
  updateLocation, confirmToken, donorRespond,
};
