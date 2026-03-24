/**
 * Hospital Controller
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages the full emergency request lifecycle for hospital users.
 */

const prisma = require('../config/prisma');
const { assignDonors, promoteBackupDonor } = require('../services/donorRanking');
const { filterWithinRadius } = require('../utils/haversine');
const { emitRequestStatusUpdate, emitTrackingStop, emitFailoverAlert } = require('../sockets');

function getIO(req) { return req.app.get('io'); }

// ─── POST /api/hospital/create-request ───────────────────────────────────────
async function createRequest(req, res, next) {
  try {
    const { blood_group, units_required, emergency_level, notes } = req.body;
    const io = getIO(req);

    const hospital = await prisma.hospital.findUnique({ where: { user_id: req.user.id } });
    if (!hospital) return res.status(404).json({ success: false, message: 'Hospital profile not found.' });

    // Create request with initial "created" state
    const request = await prisma.emergencyRequest.create({
      data: {
        hospital_id:     hospital.id,
        blood_group,
        units_required:  parseInt(units_required),
        emergency_level: emergency_level || 'high',
        notes,
        status:          'created',
      },
    });

    // Emit initial creation event
    if (io) {
      io.to('admin').emit('new_emergency_request', {
        requestId:      request.id,
        hospitalName:   hospital.hospital_name,
        bloodGroup:     blood_group,
        emergencyLevel: emergency_level,
        status:         'created',
      });
    }

    // Async: run donor search + notification + assignment
    let assignmentResult = { primary: null, backup: null, notified: 0 };
    try {
      assignmentResult = await assignDonors(request.id, io);
    } catch (rankErr) {
      console.warn('[HospitalController] Donor assignment failed:', rankErr.message);
    }

    res.status(201).json({
      success: true,
      message: 'Emergency request created. Donors are being notified.',
      data: {
        request,
        assignments: assignmentResult,
      },
    });
  } catch (err) { next(err); }
}

// ─── GET /api/hospital/requests ──────────────────────────────────────────────
async function getRequests(req, res, next) {
  try {
    const hospital = await prisma.hospital.findUnique({ where: { user_id: req.user.id } });
    if (!hospital) return res.status(404).json({ success: false, message: 'Hospital profile not found.' });

    const { status, page = 1, limit = 10 } = req.query;
    const where = { hospital_id: hospital.id };
    if (status) where.status = status;

    const [requests, total] = await Promise.all([
      prisma.emergencyRequest.findMany({
        where,
        include: {
          assignments: {
            include: {
              donor: { include: { user: { select: { name: true, phone: true } } } },
            },
            orderBy: { assigned_time: 'asc' },
          },
          _count: { select: { notificationTokens: true } },
        },
        orderBy: { created_at: 'desc' },
        skip:    (parseInt(page) - 1) * parseInt(limit),
        take:    parseInt(limit),
      }),
      prisma.emergencyRequest.count({ where }),
    ]);

    res.json({ success: true, data: requests, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
}

// ─── GET /api/hospital/nearby-donors ─────────────────────────────────────────
async function getNearbyDonors(req, res, next) {
  try {
    const { blood_group, radius = 50 } = req.query;
    const hospital = await prisma.hospital.findUnique({ where: { user_id: req.user.id } });
    if (!hospital) return res.status(404).json({ success: false, message: 'Hospital profile not found.' });

    const where = {
      availability_status: true,
      vacation_mode:       false,
      latitude:            { not: null },
      longitude:           { not: null },
      user:                { is_blocked: false },
    };
    if (blood_group) where.blood_group = blood_group;

    const donors = await prisma.donor.findMany({
      where,
      include: { user: { select: { name: true, phone: true } } },
    });

    const nearby = filterWithinRadius(
      { latitude: hospital.latitude, longitude: hospital.longitude },
      donors,
      parseFloat(radius)
    );

    res.json({ success: true, data: nearby, total: nearby.length });
  } catch (err) { next(err); }
}

// ─── GET /api/hospital/request/:id/tracking ──────────────────────────────────
async function getRequestTracking(req, res, next) {
  try {
    const { id } = req.params;
    const hospital = await prisma.hospital.findUnique({ where: { user_id: req.user.id } });
    if (!hospital) return res.status(404).json({ success: false, message: 'Hospital profile not found.' });

    const request = await prisma.emergencyRequest.findFirst({
      where:   { id, hospital_id: hospital.id },
      include: {
        assignments: {
          include: {
            donor: { include: { user: { select: { name: true, phone: true } } } },
          },
        },
      },
    });
    if (!request) return res.status(404).json({ success: false, message: 'Request not found.' });

    // Get latest location for primary donor
    const primaryAssignment = request.assignments.find(a => a.role === 'primary' && a.status !== 'failed');
    let lastLocation = null;
    if (primaryAssignment) {
      lastLocation = await prisma.donorLocation.findFirst({
        where:   { donor_id: primaryAssignment.donor_id, request_id: id },
        orderBy: { recorded_at: 'desc' },
      });
    }

    res.json({ success: true, data: { request, lastLocation, hospital } });
  } catch (err) { next(err); }
}

// ─── POST /api/hospital/promote-backup ───────────────────────────────────────
async function promoteBackup(req, res, next) {
  try {
    const { requestId } = req.body;
    const io            = getIO(req);

    const hospital = await prisma.hospital.findUnique({ where: { user_id: req.user.id } });
    const request  = await prisma.emergencyRequest.findFirst({
      where: { id: requestId, hospital_id: hospital.id },
    });
    if (!request) return res.status(404).json({ success: false, message: 'Request not found.' });

    const promoted = await promoteBackupDonor(requestId, io);

    emitFailoverAlert(io, req.user.id, {
      requestId,
      message: 'Manual failover: backup promoted to primary.',
    });

    res.json({ success: true, message: 'Backup donor promoted to primary.', data: promoted });
  } catch (err) {
    if (err.message.includes('No backup')) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  }
}

// ─── POST /api/hospital/mark-arrival ─────────────────────────────────────────
async function markArrival(req, res, next) {
  try {
    const { assignmentId } = req.body;
    const io = getIO(req);

    const updated = await prisma.donorAssignment.update({
      where:   { id: assignmentId },
      data:    { status: 'arrived', arrived_at: new Date() },
      include: { request: { include: { hospital: true } } },
    });

    // Transition request to completed stage
    await prisma.emergencyRequest.update({
      where: { id: updated.request_id },
      data:  { status: 'completed' },
    });

    emitRequestStatusUpdate(io, updated.request.hospital.user_id, {
      requestId:    updated.request_id,
      status:       'donor_arrived',
      assignmentId,
    });

    res.json({ success: true, message: 'Donor arrival marked.', data: updated });
  } catch (err) { next(err); }
}

// ─── POST /api/hospital/mark-donation ────────────────────────────────────────
async function markDonation(req, res, next) {
  try {
    const { assignmentId, donorId, status = 'successful', notes } = req.body;
    const io = getIO(req);

    const assignment = await prisma.donorAssignment.update({
      where:   { id: assignmentId },
      data:    { status: 'completed' },
      include: { request: { include: { hospital: true } } },
    });

    const hospital = await prisma.hospital.findUnique({ where: { user_id: req.user.id } });

    // ── Scoring System ────────────────────────────────────────────────────────
    // urgent → +50 pts, critical → +100 pts (else +5 for normal)
    let pointsEarned = 5;
    const emergencyLevel = assignment.request?.emergency_level;
    if (emergencyLevel === 'high')     pointsEarned = 50;
    if (emergencyLevel === 'critical') pointsEarned = 100;

    // Record donation history
    await prisma.donationHistory.create({
      data: {
        donor_id:     donorId,
        hospital_id:  hospital.id,
        request_id:   assignment.request_id,
        status,
        notes,
        points_earned: status === 'successful' ? pointsEarned : 0,
      },
    });

    // Update donor stats on successful donation
    if (status === 'successful') {
      await prisma.donor.update({
        where: { id: donorId },
        data:  {
          reliability_score: { increment: pointsEarned },
          donation_count:    { increment: 1 },
          last_donation_date: new Date(),
        },
      });
    }

    // Stop tracking — emit tracking_stopped
    emitTrackingStop(io, assignment.request.hospital.user_id, assignment.request_id);

    // Close the request if all assignments resolved
    const pendingAssignments = await prisma.donorAssignment.count({
      where: { request_id: assignment.request_id, status: { notIn: ['completed', 'rejected', 'failed'] } },
    });
    if (pendingAssignments === 0) {
      await prisma.emergencyRequest.update({
        where: { id: assignment.request_id },
        data:  { status: 'closed' },
      });
      emitRequestStatusUpdate(io, assignment.request.hospital.user_id, {
        requestId: assignment.request_id,
        status:    'closed',
      });
    }

    res.json({
      success: true,
      message: `Donation recorded. Donor awarded +${pointsEarned} points.`,
      data:    { pointsEarned },
    });
  } catch (err) { next(err); }
}

// ─── GET /api/hospital/history ────────────────────────────────────────────────
async function getHistory(req, res, next) {
  try {
    const hospital = await prisma.hospital.findUnique({ where: { user_id: req.user.id } });
    if (!hospital) return res.status(404).json({ success: false, message: 'Hospital profile not found.' });

    const { page = 1, limit = 20 } = req.query;
    const history = await prisma.donationHistory.findMany({
      where:   { hospital_id: hospital.id },
      include: {
        donor:   { include: { user: { select: { name: true, phone: true } } } },
        request: { select: { blood_group: true, emergency_level: true, units_required: true } },
      },
      orderBy: { donation_date: 'desc' },
      skip:    (parseInt(page) - 1) * parseInt(limit),
      take:    parseInt(limit),
    });
    const total = await prisma.donationHistory.count({ where: { hospital_id: hospital.id } });

    res.json({ success: true, data: history, total });
  } catch (err) { next(err); }
}

module.exports = {
  createRequest, getRequests, getNearbyDonors,
  getRequestTracking, promoteBackup, markArrival, markDonation, getHistory,
};
