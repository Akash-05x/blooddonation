/**
 * Hospital Controller
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages the full emergency request lifecycle for hospital users.
 */

const prisma = require('../config/prisma');
const { initiateEmergencySearch, finalizeEmergencyAssignment, promoteBackupDonor } = require('../services/donorRanking');
const { haversineDistance } = require('../utils/haversine');
const { emitRequestStatusUpdate, emitTrackingStop, emitFailoverAlert } = require('../sockets');

function getIO(req) { return req.app.get('io'); }

// ─── POST /api/hospital/create-request ───────────────────────────────────────
async function createRequest(req, res, next) {
  try {
    const {
      blood_group, units_required, emergency_level, notes,
      // Live location at time of request (optional)
      hospital_lat, hospital_lng, request_district,
    } = req.body;
    const io = getIO(req);

    const hospital = await prisma.hospital.findUnique({ where: { user_id: req.user.id } });
    if (!hospital) return res.status(404).json({ success: false, message: 'Hospital profile not found.' });

    // Parse live location coords (if provided)
    const reqLat = hospital_lat != null ? parseFloat(hospital_lat) : null;
    const reqLng = hospital_lng != null ? parseFloat(hospital_lng) : null;

    // Create request with initial "created" state + live location
    const request = await prisma.emergencyRequest.create({
      data: {
        hospital_id:       hospital.id,
        blood_group,
        units_required:    parseInt(units_required),
        emergency_level:   emergency_level || 'high',
        notes,
        status:            'created',
        request_lat:       reqLat,
        request_lng:       reqLng,
        request_district:  request_district || hospital.district || null,
      },
    });

    // Emit initial creation event
    if (io) {
      io.to('admin').emit('new_emergency_request', {
        requestId:      request.id,
        hospitalName:   hospital.hospital_name,
        bloodGroup:     blood_group,
        emergencyLevel: emergency_level,
        district:       request.request_district,
        status:         'created',
      });
    }

    // Async: run donor search + notification (Phase 1 & 2)
    let searchResult = { notified: 0, status: 'awaiting_confirmation' };
    try {
      searchResult = await initiateEmergencySearch(request.id, io, {
        overrideLat: reqLat,
        overrideLng: reqLng,
        district:    request_district || hospital.district || null,
      });
    } catch (rankErr) {
      console.warn('[HospitalController] Emergency initiation failed:', rankErr.message);
    }

    res.status(201).json({
      success: true,
      message: 'Emergency request created. Donors are being notified.',
      data: {
        request,
        searchResult,
      },
    });
  } catch (err) { next(err); }
}

// ─── POST /api/hospital/emergency-request ───────────────────────────────────────
async function createEmergencyRequest(req, res, next) {
  try {
    const { bloodType, urgencyLevel, hospitalLocation } = req.body;
    const io = getIO(req);
    const hospital = await prisma.hospital.findUnique({ where: { user_id: req.user.id } });
    if (!hospital) return res.status(404).json({ success: false, message: 'Hospital profile not found.' });

    const reqLat = hospitalLocation && hospitalLocation.lat ? parseFloat(hospitalLocation.lat) : hospital.latitude;
    const reqLng = hospitalLocation && hospitalLocation.lng ? parseFloat(hospitalLocation.lng) : hospital.longitude;

    const request = await prisma.emergencyRequest.create({
      data: {
        hospital_id: hospital.id,
        blood_group: bloodType || 'A_POS',
        units_required: 1,
        emergency_level: urgencyLevel || 'high',
        status: 'active',
        request_lat: reqLat,
        request_lng: reqLng,
      },
    });

    // Event-driven architecture: Emit EmergencyRequestCreated
    const EventEmitter = require('events');
    const myEmitter = new EventEmitter();
    myEmitter.emit('EmergencyRequestCreated', request);
    if (io) {
      io.to('admin').emit('EmergencyRequestCreated', request);
    }

    let assignmentResult = { primary: null, backup: null, notified: 0 };
    try {
      assignmentResult = await assignDonors(request.id, io, {
        overrideLat: reqLat,
        overrideLng: reqLng,
      });
    } catch (rankErr) {
      console.warn('[HospitalController] Donor assignment failed:', rankErr.message);
    }

    res.status(201).json({
      success: true,
      message: 'Emergency request created with status ACTIVE.',
      data: {
        requestId: request.id,
        status: 'ACTIVE',
        timestamp: request.created_at,
        assignments: assignmentResult
      },
    });
  } catch(err) { next(err); }
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
          _count: { select: { notificationTokens: { where: { status: 'confirmed' } } } },
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
      user:                { is_blocked: false },
    };
    if (blood_group) where.blood_group = blood_group;

    const donors = await prisma.donor.findMany({
      where,
      include: { user: { select: { name: true, phone: true, email: true } } },
    });

    const normHospDistrict = (hospital.district || '').toLowerCase().trim();
    let nearby = [];

    donors.forEach(d => {
      let keep = false;
      let dist = 9999;
      const isSameDistrict = normHospDistrict && d.district && d.district.toLowerCase().trim() === normHospDistrict;

      if (d.latitude != null && d.longitude != null && hospital.latitude != null && hospital.longitude != null) {
        dist = haversineDistance(hospital.latitude, hospital.longitude, d.latitude, d.longitude);
        if (dist <= parseFloat(radius)) keep = true;
      }

      if (isSameDistrict) {
        keep = true;
        if (dist === 9999) dist = Math.min(parseFloat(radius) - 1, 25);
      }

      if (keep) {
        d.distance_km = dist === 9999 ? parseFloat(radius) : dist;
        d.is_same_district = isSameDistrict;
        nearby.push(d);
      }
    });

    if (normHospDistrict) {
      const sameDistrict = nearby.filter(d => d.is_same_district).sort((a, b) => a.distance_km - b.distance_km);
      const others = nearby.filter(d => !d.is_same_district).sort((a, b) => a.distance_km - b.distance_km);
      nearby = [...sameDistrict, ...others];
    }

    res.json({ success: true, data: nearby, total: nearby.length, hospital_district: hospital.district });
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

    // Keep request status as in_transit — it moves to 'completed' only when donation is marked
    // (do NOT set status to 'completed' here — that happens in markDonation)
    emitRequestStatusUpdate(io, updated.request.hospital.user_id, {
      requestId:    updated.request_id,
      status:       'donor_arrived',
      assignmentId,
    });

    // Stop live GPS tracking — donor has arrived, no need to track further
    const donorUserId = updated.donor?.user_id;
    emitTrackingStop(io, updated.request.hospital.user_id, donorUserId, updated.request_id);

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
      include: { 
        request: { include: { hospital: true } },
        donor: { select: { user_id: true } }
      },
    });

    const hospital = await prisma.hospital.findUnique({ where: { user_id: req.user.id } });

    // ── Scoring System ────────────────────────────────────────────────────────
    let pointsEarned = 5;
    const emergencyLevel = assignment.request?.emergency_level;
    if (emergencyLevel === 'high')     pointsEarned = 50;
    if (emergencyLevel === 'critical') pointsEarned = 100;

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

    // Close the request if all assignments resolved
    const pendingAssignments = await prisma.donorAssignment.count({
      where: { request_id: assignment.request_id, status: { notIn: ['completed', 'rejected', 'failed'] } },
    });

    if (pendingAssignments === 0) {
      await prisma.emergencyRequest.update({
        where: { id: assignment.request_id },
        data:  { status: 'completed' },
      });

      // Notify all involved donors
      const allAssignments = await prisma.donorAssignment.findMany({
        where: { request_id: assignment.request_id },
        include: { donor: { select: { user_id: true } } }
      });
      const donorUserIds = [...new Set(allAssignments.map(a => a.donor?.user_id).filter(Boolean))];

      const { emitRequestCompleted } = require('../sockets');
      emitRequestCompleted(io, assignment.request.hospital.user_id, donorUserIds, assignment.request_id);
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

// ─── POST /api/hospital/finalize-assignment ──────────────────────────────────
async function finalizeAssignment(req, res, next) {
  try {
    const { requestId } = req.body;
    const io = getIO(req);
    const result = await finalizeEmergencyAssignment(requestId, io);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) { next(err); }
}

// ─── DELETE /api/hospital/request/:id ──────────────────────────────────────────
async function deleteRequest(req, res, next) {
  try {
    const { id } = req.params;
    const hospital = await prisma.hospital.findUnique({ where: { user_id: req.user.id } });
    if (!hospital) return res.status(404).json({ success: false, message: 'Hospital profile not found.' });

    const request = await prisma.emergencyRequest.findFirst({
      where: { id, hospital_id: hospital.id },
    });
    
    if (!request) return res.status(404).json({ success: false, message: 'Request not found.' });

    if (!['completed', 'closed', 'cancelled', 'failed'].includes(request.status)) {
       // Optional: force mark as cancelled instead of delete for audit
       await prisma.emergencyRequest.update({
         where: { id },
         data: { status: 'cancelled' }
       });
       return res.json({ success: true, message: 'Active request cancelled.' });
    }

    // Really delete or hide
    await prisma.emergencyRequest.delete({ where: { id } });

    res.json({ success: true, message: 'Request deleted successfully.' });
  } catch (err) { next(err); }
}


async function updateProfile(req, res, next) {
  try {
    const { latitude, longitude, address, district } = req.body;
    const hospital = await prisma.hospital.findUnique({ where: { user_id: req.user.id } });
    if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found.' });

    const updated = await prisma.hospital.update({
      where: { id: hospital.id },
      data: {
        latitude:  latitude  != null ? parseFloat(latitude)  : hospital.latitude,
        longitude: longitude != null ? parseFloat(longitude) : hospital.longitude,
        address:   address  || hospital.address,
        district:  district || hospital.district,
      },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createRequest, createEmergencyRequest, getRequests, getNearbyDonors,
  getRequestTracking, promoteBackup, markArrival, markDonation, getHistory,
  finalizeAssignment, deleteRequest, updateProfile
};
