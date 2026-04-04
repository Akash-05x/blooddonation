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

    const tokens = await prisma.notificationToken.findMany({
      where: {
        donor_id: donor.id,
        status:   { in: ['pending', 'confirmed'] },
        expires_at: { gt: new Date() },
        request:  { status: 'awaiting_confirmation' },
      },
      include: {
        request: {
          include: {
            hospital: { select: { hospital_name: true, address: true, latitude: true, longitude: true, user_id: true } },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const pendingTokenAlerts = tokens.map(t => ({
      id: t.id,
      isToken: true,
      tokenId: t.token,
      status: t.status === 'confirmed' ? 'accepted' : 'pending',
      request: t.request,
    }));

    res.json({ success: true, data: [...assignments, ...pendingTokenAlerts] });
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

      // 2. Count current accepted assignments and check for existing primary
      const currentAssignments = await tx.donorAssignment.findMany({
        where: { request_id: assignment.request_id, status: 'accepted' }
      });

      if (currentAssignments.length >= 2) {
        throw new Error('This request has already been fulfilled by other donors.');
      }

      const hasPrimary = currentAssignments.some(a => a.role === 'primary');
      const assignedRole = !hasPrimary ? 'primary' : 'backup';

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
      donorId:   donor.id,
      donorName: req.user.name,
      message:   `Donor ${req.user.name} rejected the request.`,
    });

    // Auto-promote backup if primary rejected
    if (assignment.role === 'primary') {
      try {
        const promoted = await promoteBackupDonor(assignment.request_id, io);
        emitDonorResponse(io, assignment.request.hospital.user_id, 'backup_promoted', {
          requestId: assignment.request_id,
          donorName: promoted.donor?.user?.name,
          message:   'Backup donor has been promoted to primary due to rejection.',
        });
      } catch (err) {
        console.warn('[DonorController] Failover failed after rejection:', err.message);
        
        await prisma.emergencyRequest.update({
          where: { id: assignment.request_id },
          data:  { status: 'donor_search' },
        });

        // Notify hospital we are searching again
        emitRequestStatusUpdate(io, assignment.request.hospital.user_id, {
          requestId: assignment.request_id,
          status:    'donor_search',
        });
        
        // Auto-restart search
        const { initiateEmergencySearch } = require('../services/donorRanking');
        try {
          await initiateEmergencySearch(assignment.request_id, io);
        } catch (searchErr) {
          await prisma.emergencyRequest.update({
            where: { id: assignment.request_id },
            data:  { status: 'failed' },
          });
          emitRequestStatusUpdate(io, assignment.request.hospital.user_id, {
            requestId: assignment.request_id,
            status:    'failed',
            message:   'Request failed: Primary donor rejected and no eligible donors left.'
          });
        }
      }
    }

    res.json({ success: true, message: 'Request rejected. Dashboard updated.' });
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
        request:  {
          include: {
            assignments: {
              include: { donor: { include: { user: { select: { name: true } } } } }
            }
          }
        },
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

    const [location] = await Promise.all([
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
    ]);

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

    // 3. Update donor's last response time
    await prisma.donor.update({
      where: { id: donor.id },
      data:  { last_response_time: new Date() },
    });

    // 4. LATE RESPONDER LOGIC: 
    // If request is already assigned/in_transit, create a 'reserve' assignment
    // so they are available for failover.
    const reqStatus = result.notificationToken?.request?.status;
    if (reqStatus === 'assigned' || reqStatus === 'in_transit') {
       await prisma.donorAssignment.upsert({
         where: { 
           request_id_donor_id: { 
             request_id: result.notificationToken.request_id, 
             donor_id: donor.id 
           } 
         },
         create: {
           request_id: result.notificationToken.request_id,
           donor_id: donor.id,
           role: 'reserve',
           status: 'pending',
           score: 0.5, // Default score for late responder
           distance_km: 1.0, // Placeholder
         },
         update: { 
           role: 'reserve' // Don't overwrite if they already had a role
         }
       });
       console.log(`[ConfirmToken] Late responder ${donor.id} added as RESERVE for request ${result.notificationToken.request_id}`);
    }

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

// ─── POST /api/donor/reject-token ───────────────────────────────────────────
async function rejectToken(req, res, next) {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'Token is required.' });

    const donor = await prisma.donor.findUnique({ where: { user_id: req.user.id } });
    if (!donor) return res.status(404).json({ success: false, message: 'Donor not found.' });

    const record = await prisma.notificationToken.findUnique({ where: { token } });
    if (!record || record.donor_id !== donor.id) {
      return res.status(404).json({ success: false, message: 'Token not found.' });
    }

    await prisma.notificationToken.update({
      where: { id: record.id },
      data: { status: 'cancelled', responded_at: new Date() }
    });

    res.json({ success: true, message: 'Token rejected.' });
  } catch (err) { next(err); }
}

// ─── POST /api/donor/cancel-donation ────────────────────────────────────────
async function cancelDonation(req, res, next) {
  try {
    const { requestId, reason } = req.body;
    const io = getIO(req);

    const donor = await prisma.donor.findUnique({ where: { user_id: req.user.id } });
    const assignment = await prisma.donorAssignment.findUnique({
      where: { request_id_donor_id: { request_id: requestId, donor_id: donor.id } },
      include: { request: { include: { hospital: true } } }
    });

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found.' });
    }

    if (assignment.status !== 'accepted' && assignment.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Current assignment status does not allow cancellation.' });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Mark current assignment as failed/cancelled
      await tx.donorAssignment.update({
        where: { id: assignment.id },
        data: { status: 'failed' }
      });

      // 2. Create Donation History Record
      await tx.donationHistory.create({
        data: {
          donor_id:    donor.id,
          hospital_id: assignment.request.hospital_id,
          request_id:  requestId,
          status:      'failed',
          notes:       `Donor cancelled manually. Reason: ${reason || 'Not specified'}`
        }
      });

      // 3. Penalize reliability score (cancellation is serious)
      await tx.donor.update({
        where: { id: donor.id },
        data: { reliability_score: { decrement: 15 } }
      });
    });

    // 4. Trigger Failover if Primary cancelled
    if (assignment.role === 'primary') {
      try {
        await promoteBackupDonor(requestId, io);
      } catch (err) {
        // No backup available — restart search instead of failing
        await prisma.emergencyRequest.update({
          where: { id: requestId },
          data: { status: 'donor_search' }
        });
        
        if (io) {
          io.to(`hospital_${assignment.request.hospital.user_id}`).emit('request_status_update', {
            requestId,
            status: 'donor_search',
          });
        }

        // Auto-restart search
        const { initiateEmergencySearch } = require('../services/donorRanking');
        try {
          await initiateEmergencySearch(requestId, io);
        } catch (searchErr) {
          await prisma.emergencyRequest.update({
            where: { id: requestId },
            data: { status: 'failed' }
          });
          if (io) {
            io.to(`hospital_${assignment.request.hospital.user_id}`).emit('request_failed', {
              requestId,
              message: 'Primary donor cancelled and no eligible donors left in the system.'
            });
          }
        }
      }
    } else if (assignment.role === 'backup') {
      // If backup cancelled, try to fill from reserve
      const bestReserve = await prisma.donorAssignment.findFirst({
        where: { request_id: requestId, role: 'reserve', status: { notIn: ['rejected', 'failed'] } },
        orderBy: { score: 'desc' }
      });
      if (bestReserve) {
        await prisma.donorAssignment.update({
          where: { id: bestReserve.id },
          data: { role: 'backup', status: 'pending' }
        });
      }
    }

    res.json({ success: true, message: 'Donation request cancelled successfully.' });
  } catch (err) { next(err); }
}

// ─── GET /api/donor/active-assignment ──────────────────────────────────────
async function getActiveAssignment(req, res, next) {
  try {
    const donor = await prisma.donor.findUnique({ where: { user_id: req.user.id } });
    if (!donor) return res.status(404).json({ success: false, message: 'Donor not found.' });

    const active = await prisma.donorAssignment.findFirst({
      where: {
        donor_id: donor.id,
        status:   { in: ['pending', 'accepted'] },
        request:  { status: { in: ['assigned', 'in_transit'] } },
      },
      select: { request_id: true }
    });

    res.json({ 
      success: true, 
      active: !!active, 
      requestId: active?.request_id || null 
    });
  } catch (err) { next(err); }
}

module.exports = {
  getProfile, updateProfile, getAlerts,
  acceptRequest, rejectRequest, getHistory,
  updateLocation, confirmToken, donorRespond, rejectToken,
  cancelDonation, getActiveAssignment
};
