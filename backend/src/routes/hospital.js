const express = require('express');
const router  = express.Router();
const { authenticate, authorize, requireVerifiedHospital } = require('../middleware/auth');
const {
  createRequest, createEmergencyRequest, getRequests, getNearbyDonors,
  getRequestTracking, promoteBackup, markArrival, markDonation, getHistory,
  finalizeAssignment,
} = require('../controllers/hospitalController');

// All hospital routes require JWT + hospital role + verified status
router.use(authenticate, authorize('hospital'), requireVerifiedHospital);

// POST /api/hospital/emergency-request (New exact API signature)
router.post('/emergency-request', createEmergencyRequest);

// POST /api/hospital/create-request
router.post('/create-request', createRequest);

// GET  /api/hospital/requests
router.get('/requests', getRequests);

// GET  /api/hospital/nearby-donors
router.get('/nearby-donors', getNearbyDonors);

// GET  /api/hospital/request/:id/tracking — live tracking data for a request
router.get('/request/:id/tracking', getRequestTracking);

// POST /api/hospital/promote-backup
router.post('/promote-backup', promoteBackup);

// POST /api/hospital/mark-arrival
router.post('/mark-arrival', markArrival);

// POST /api/hospital/mark-donation
router.post('/mark-donation', markDonation);

// GET  /api/hospital/history
router.get('/history', getHistory);

// POST /api/hospital/finalize-assignment
router.post('/finalize-assignment', finalizeAssignment);

module.exports = router;
