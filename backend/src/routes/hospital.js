const express = require('express');
const router  = express.Router();
const { authenticate, authorize, requireVerifiedHospital } = require('../middleware/auth');
const {
  createRequest, createEmergencyRequest, getRequests, getNearbyDonors, searchDonors,
  getRequestTracking, promoteBackup, markArrival, markDonation, getHistory,
  finalizeAssignment, deleteRequest, updateProfile, cancelRequest,
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

// GET  /api/hospital/search-donors
router.get('/search-donors', searchDonors);

// GET  /api/hospital/request/:id/tracking — live tracking data for a request
router.get('/request/:id/tracking', getRequestTracking);

// DELETE /api/hospital/request/:id
router.delete('/request/:id', deleteRequest);

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

// POST /api/hospital/cancel-request
router.post('/cancel-request', cancelRequest);

// PUT /api/hospital/profile
router.put('/profile', updateProfile);

module.exports = router;
