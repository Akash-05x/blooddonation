const express = require('express');
const router = express.Router();
const { register, login, verifyOTP, resendOTP, forgotPassword, resetPassword } = require('../controllers/authController');

// POST /api/register
router.post('/register', register);

// POST /api/login
router.post('/login', login);

// POST /api/verify-otp
router.post('/verify-otp', verifyOTP);

// POST /api/resend-otp  ← NEW: dedicated resend with correct purpose
router.post('/resend-otp', resendOTP);

// POST /api/forgot-password
router.post('/forgot-password', forgotPassword);

// POST /api/reset-password
router.post('/reset-password', resetPassword);

module.exports = router;