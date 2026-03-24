const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  getHospitals, verifyHospital, getDonors, blockUser,
  getEmergencyMonitoring, getReports, getSystemConfig, updateSystemConfig,
  getSystemStats, getPendingHospitals, approvePendingHospital, rejectPendingHospital,
} = require('../controllers/adminController');

// All admin routes require JWT + admin role
router.use(authenticate, authorize('admin'));

// GET  /api/admin/hospitals
router.get('/hospitals', getHospitals);

// POST /api/admin/verify-hospital
router.post('/verify-hospital', verifyHospital);

// GET  /api/admin/donors
router.get('/donors', getDonors);

// POST /api/admin/block-user
router.post('/block-user', blockUser);

// GET  /api/admin/emergency-monitoring
router.get('/emergency-monitoring', getEmergencyMonitoring);

// GET  /api/admin/reports
router.get('/reports', getReports);

// GET  /api/admin/system-config
router.get('/system-config', getSystemConfig);

// PUT  /api/admin/system-config
router.put('/system-config', updateSystemConfig);

// GET  /api/admin/stats  — live system stats for dashboard
router.get('/stats', getSystemStats);

// ─── Pending Hospital Approvals ──────────────────────────────────────────
router.get('/pending-hospitals', getPendingHospitals);
router.post('/approve-hospital/:id', approvePendingHospital);
router.post('/reject-hospital/:id', rejectPendingHospital);

module.exports = router;
