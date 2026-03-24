const prisma = require('../config/prisma');

// ─── GET /api/admin/hospitals ────────────────────────────────────────────────
async function getHospitals(req, res, next) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const where = {};
    if (status) where.verified_status = status;
    const combinedWhere = { ...where, user: { otp_verified: true } };

    const [hospitals, total] = await Promise.all([
      prisma.hospital.findMany({
        where: combinedWhere,
        include: { user: { select: { name: true, email: true, phone: true, is_blocked: true, created_at: true } } },
        orderBy: { created_at: 'desc' },
        skip:    (parseInt(page) - 1) * parseInt(limit),
        take:    parseInt(limit),
      }),
      prisma.hospital.count({ where: combinedWhere }),
    ]);

    res.json({ success: true, data: hospitals, total, page: parseInt(page) });
  } catch (err) { next(err); }
}

// ─── POST /api/admin/verify-hospital ─────────────────────────────────────────
async function verifyHospital(req, res, next) {
  try {
    const { hospitalId, action } = req.body;
    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Action must be "approved" or "rejected".' });
    }

    const hospital = await prisma.hospital.update({
      where:   { id: hospitalId },
      data:    { verified_status: action },
      include: { user: { select: { name: true, email: true } } },
    });

    if (action === 'approved' && hospital.user?.email) {
      const { createOTP }    = require('../utils/otp');
      const { sendOTPEmail } = require('../utils/mailer');
      try {
        const { otp } = await createOTP(hospital.user_id, 'verification');
        await sendOTPEmail(hospital.user.email, otp, 'verification');
      } catch (otpErr) {
        console.error('Failed to send OTP on hospital approval:', otpErr);
      }
    }

    await prisma.adminLog.create({
      data: {
        admin_id:       req.user.id,
        action:         `hospital_${action}`,
        target_user_id: hospital.user_id,
        details:        { hospitalId, hospital_name: hospital.hospital_name },
      },
    });

    res.json({ success: true, message: `Hospital ${action} successfully.`, data: hospital });
  } catch (err) { next(err); }
}

// ─── GET /api/admin/donors ────────────────────────────────────────────────────
async function getDonors(req, res, next) {
  try {
    const { blood_group, page = 1, limit = 20 } = req.query;
    const where = {};
    if (blood_group) where.blood_group = blood_group;

    const [donors, total] = await Promise.all([
      prisma.donor.findMany({
        where,
        include: {
          user:  { select: { name: true, email: true, phone: true, is_blocked: true, created_at: true } },
          _count: { select: { donationHistory: true, assignments: true } },
        },
        orderBy: { reliability_score: 'desc' },
        skip:    (parseInt(page) - 1) * parseInt(limit),
        take:    parseInt(limit),
      }),
      prisma.donor.count({ where }),
    ]);

    res.json({ success: true, data: donors, total, page: parseInt(page) });
  } catch (err) { next(err); }
}

// ─── POST /api/admin/block-user ──────────────────────────────────────────────
async function blockUser(req, res, next) {
  try {
    const { userId, action } = req.body;
    const is_blocked = action === 'block';

    const user = await prisma.user.update({
      where:  { id: userId },
      data:   { is_blocked },
      select: { id: true, name: true, email: true, role: true, is_blocked: true },
    });

    await prisma.adminLog.create({
      data: {
        admin_id:       req.user.id,
        action:         `user_${action}ed`,
        target_user_id: userId,
        details:        { action, userEmail: user.email },
      },
    });

    res.json({ success: true, message: `User ${action}ed successfully.`, data: user });
  } catch (err) { next(err); }
}

// ─── GET /api/admin/emergency-monitoring ─────────────────────────────────────
async function getEmergencyMonitoring(req, res, next) {
  try {
    const { status, emergency_level, page = 1, limit = 20 } = req.query;
    const where = {};
    if (status)          where.status          = status;
    if (emergency_level) where.emergency_level = emergency_level;

    const [requests, total] = await Promise.all([
      prisma.emergencyRequest.findMany({
        where,
        include: {
          hospital: { select: { hospital_name: true, address: true, latitude: true, longitude: true, user_id: true } },
          assignments: {
            include: {
              donor: { include: { user: { select: { name: true, phone: true } } } },
            },
          },
          _count: { select: { notificationTokens: true } },
        },
        orderBy: { created_at: 'desc' },
        skip:    (parseInt(page) - 1) * parseInt(limit),
        take:    parseInt(limit),
      }),
      prisma.emergencyRequest.count({ where }),
    ]);

    res.json({ success: true, data: requests, total, page: parseInt(page) });
  } catch (err) { next(err); }
}

// ─── GET /api/admin/reports ───────────────────────────────────────────────────
async function getReports(req, res, next) {
  try {
    const now           = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers, totalDonors, totalHospitals, totalRequests,
      completedRequests, activeRequests, verifiedHospitals,
      pendingHospitalsCount,
      recentDonations, topDonors, recentHospitals, bloodGroupStats,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.donor.count(),
      prisma.hospital.count(),
      prisma.emergencyRequest.count(),
      prisma.emergencyRequest.count({ where: { status: { in: ['completed', 'closed'] } } }),
      prisma.emergencyRequest.count({ where: { status: { in: ['assigned', 'in_transit', 'awaiting_confirmation'] } } }),
      prisma.hospital.count({ where: { verified_status: 'approved' } }),
      prisma.pendingHospital.count(),
      prisma.donationHistory.count({ where: { donation_date: { gte: thirtyDaysAgo } } }),
      prisma.donor.findMany({
        orderBy: { reliability_score: 'desc' },
        take:    5,
        include: {
          user:  { select: { name: true, email: true } },
          _count: { select: { donationHistory: true } },
        },
      }),
      prisma.hospital.findMany({
        orderBy: { created_at: 'desc' },
        take:    5,
        include: {
          user: { select: { name: true, email: true, is_blocked: true } }
        }
      }),
      prisma.donor.groupBy({ by: ['blood_group'], _count: { blood_group: true } }),
    ]);

    res.json({
      success: true,
      data: {
        overview:              { totalUsers, totalDonors, totalHospitals, totalRequests, verifiedHospitals, pendingHospitals: pendingHospitalsCount },
        requests:              { total: totalRequests, completed: completedRequests, active: activeRequests },
        donations:             { last30Days: recentDonations },
        pendingHospitalsCount,
        topDonors,
        recentHospitals,
        bloodGroupDistribution: bloodGroupStats,
      },
    });
  } catch (err) { next(err); }
}

// ─── GET /api/admin/system-config ────────────────────────────────────────────
async function getSystemConfig(req, res, next) {
  try {
    let config = await prisma.systemConfiguration.findFirst();
    if (!config) {
      config = await prisma.systemConfiguration.create({
        data: {
          distance_radius:              50,
          ranking_weight_response:      0.5,
          ranking_weight_distance:      0.3,
          ranking_weight_history:       0.2,
          gps_timeout_minutes:          2,
          notification_expiry_minutes:  10,
        },
      });
    }
    res.json({ success: true, data: config });
  } catch (err) { next(err); }
}

// ─── PUT /api/admin/system-config ────────────────────────────────────────────
async function updateSystemConfig(req, res, next) {
  try {
    const {
      distance_radius,
      ranking_weight_response, ranking_weight_distance, ranking_weight_history,
      gps_timeout_minutes, notification_expiry_minutes,
    } = req.body;

    // Validate weights sum to ~1
    const wR = parseFloat(ranking_weight_response  || 0);
    const wD = parseFloat(ranking_weight_distance  || 0);
    const wH = parseFloat(ranking_weight_history   || 0);
    const sum = wR + wD + wH;

    if ((ranking_weight_response || ranking_weight_distance || ranking_weight_history) &&
        (sum < 0.99 || sum > 1.01)) {
      return res.status(400).json({ success: false, message: 'Ranking weights must sum to 1.0.' });
    }

    let config = await prisma.systemConfiguration.findFirst();
    if (!config) config = await prisma.systemConfiguration.create({ data: {} });

    const updated = await prisma.systemConfiguration.update({
      where: { id: config.id },
      data: {
        ...(distance_radius             !== undefined && { distance_radius:             parseFloat(distance_radius) }),
        ...(ranking_weight_response     !== undefined && { ranking_weight_response:     wR }),
        ...(ranking_weight_distance     !== undefined && { ranking_weight_distance:     wD }),
        ...(ranking_weight_history      !== undefined && { ranking_weight_history:      wH }),
        ...(gps_timeout_minutes         !== undefined && { gps_timeout_minutes:         parseInt(gps_timeout_minutes) }),
        ...(notification_expiry_minutes !== undefined && { notification_expiry_minutes: parseInt(notification_expiry_minutes) }),
      },
    });

    await prisma.adminLog.create({
      data: { admin_id: req.user.id, action: 'system_config_updated', details: updated },
    });

    res.json({ success: true, message: 'System configuration updated.', data: updated });
  } catch (err) { next(err); }
}

// ─── GET /api/admin/pending-hospitals ────────────────────────────────────────
async function getPendingHospitals(req, res, next) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const [hospitals, total] = await Promise.all([
      prisma.pendingHospital.findMany({
        orderBy: { created_at: 'desc' },
        skip:    (parseInt(page) - 1) * parseInt(limit),
        take:    parseInt(limit),
      }),
      prisma.pendingHospital.count(),
    ]);

    res.json({ success: true, data: hospitals, total, page: parseInt(page) });
  } catch (err) { next(err); }
}

// ─── POST /api/admin/approve-hospital/:id ─────────────────────────────────────
async function approvePendingHospital(req, res, next) {
  try {
    const { id } = req.params;
    const pending = await prisma.pendingHospital.findUnique({ where: { id } });
    if (!pending) return res.status(404).json({ success: false, message: 'Pending hospital not found.' });

    const user = await prisma.$transaction(async (tx) => {
      // Create User
      const newUser = await tx.user.create({
        data: {
          name:     pending.authorized_person_name || pending.hospital_name,
          email:    pending.email,
          phone:    pending.phone,
          password: pending.password,
          role:     'hospital',
          otp_verified: false, // Will require OTP verification after approval
        },
      });

      // Create Hospital Profile
      const hospital = await tx.hospital.create({
        data: {
          user_id:                newUser.id,
          hospital_name:          pending.hospital_name,
          district:               pending.district,
          address:                pending.address,
          telephone:              pending.telephone,
          official_email:         pending.official_email,
          latitude:               pending.latitude,
          longitude:              pending.longitude,
          hospital_type:          pending.hospital_type,
          controlling_dept:       pending.controlling_dept,
          hospital_category:      pending.hospital_category,
          clinical_reg_no:        pending.clinical_reg_no,
          issue_date:             pending.issue_date,
          expiry_date:            pending.expiry_date,
          issuing_authority:      pending.issuing_authority,
          nabh_accreditation_no:  pending.nabh_accreditation_no,
          abdm_facility_id:       pending.abdm_facility_id,
          authorized_person_name: pending.authorized_person_name,
          authorized_designation: pending.authorized_designation,
          authorized_email:       pending.authorized_email,
          verified_status:        'approved',
        },
      });

      // Delete Pending Record
      await tx.pendingHospital.delete({ where: { id } });

      return { newUser, hospital };
    });

    // Send Approval/Verification Email
    const { createOTP }    = require('../utils/otp');
    const { sendOTPEmail } = require('../utils/mailer');
    try {
      const { otp } = await createOTP(user.newUser.id, 'verification');
      await sendOTPEmail(pending.official_email || pending.email, otp, 'verification');
    } catch (emailErr) {
      console.error('Failed to send approval email:', emailErr);
    }

    await prisma.adminLog.create({
      data: {
        admin_id:       req.user.id,
        action:         'hospital_approved',
        target_user_id: user.newUser.id,
        details:        { pendingId: id, hospital_name: pending.hospital_name },
      },
    });

    res.json({ success: true, message: 'Hospital approved successfully. Credentials moved to active records.', data: user.hospital });
  } catch (err) { next(err); }
}

// ─── POST /api/admin/reject-hospital/:id ─────────────────────────────────────
async function rejectPendingHospital(req, res, next) {
  try {
    const { id } = req.params;
    const pending = await prisma.pendingHospital.findUnique({ where: { id } });
    if (!pending) return res.status(404).json({ success: false, message: 'Pending hospital not found.' });

    await prisma.pendingHospital.delete({ where: { id } });

    await prisma.adminLog.create({
      data: {
        admin_id: req.user.id,
        action:   'hospital_rejected',
        details:  { pendingId: id, hospital_name: pending.hospital_name },
      },
    });

    res.json({ success: true, message: 'Hospital registration rejected and removed.' });
  } catch (err) { next(err); }
}

// ─── GET /api/admin/stats ─────────────────────────────────────────────────────
async function getSystemStats(req, res, next) {
  try {
    const [
      activeRequests, pendingAssignments, totalDonorsOnline,
      pendingHospitals, totalDonors, todayDonations,
    ] = await Promise.all([
      prisma.emergencyRequest.count({
        where: { status: { in: ['created', 'donor_search', 'awaiting_confirmation', 'assigned', 'in_transit'] } },
      }),
      prisma.donorAssignment.count({ where: { status: 'pending' } }),
      prisma.donor.count({ where: { availability_status: true, vacation_mode: false } }),
      prisma.pendingHospital.count(), // Updated to count from pending_hospitals
      prisma.donor.count(),
      prisma.donationHistory.count({
        where: { donation_date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
    ]);

    res.json({
      success: true,
      data: {
        activeRequests,
        pendingAssignments,
        availableDonors: totalDonorsOnline,
        pendingHospitalVerifications: pendingHospitals,
        totalDonors,
        todayDonations,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) { next(err); }
}

module.exports = {
  getHospitals, verifyHospital, getDonors, blockUser,
  getEmergencyMonitoring, getReports, getSystemConfig, updateSystemConfig,
  getSystemStats, getPendingHospitals, approvePendingHospital, rejectPendingHospital,
};
