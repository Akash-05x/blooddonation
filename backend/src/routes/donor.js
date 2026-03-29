const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  getProfile, updateProfile, getAlerts,
  acceptRequest, rejectRequest, getHistory,
  updateLocation, confirmToken, donorRespond,
} = require('../controllers/donorController');

// All donor routes require JWT + donor role
router.use(authenticate, authorize('donor'));

// POST /api/donor/respond (New exact API signature)
router.post('/respond', donorRespond);

// GET  /api/donor/profile
router.get('/profile', getProfile);

// PUT  /api/donor/profile
router.put('/profile', updateProfile);

// GET  /api/donor/alerts
router.get('/alerts', getAlerts);

// POST /api/donor/accept-request
router.post('/accept-request', acceptRequest);

// POST /api/donor/reject-request
router.post('/reject-request', rejectRequest);

// GET  /api/donor/history
router.get('/history', getHistory);

// POST /api/donor/location  — GPS location update (HTTP fallback for WebSocket)
router.post('/location', updateLocation);

// POST /api/donor/confirm-token  — Confirm notification token to enter candidate pool
router.post('/confirm-token', confirmToken);

module.exports = router;
