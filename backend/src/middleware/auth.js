const { verifyToken } = require('../utils/jwt');
const prisma = require('../config/prisma');

/**
 * Authenticate request via JWT Bearer token.
 * Attaches req.user = { id, email, role } on success.
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    // Verify user still exists and is not blocked
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, role: true, is_blocked: true, otp_verified: true },
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }
    if (user.is_blocked) {
      return res.status(403).json({ success: false, message: 'Account is blocked.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token has expired. Please login again.' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
}

/**
 * Role-based access guard factory.
 * Usage: authorize('admin') or authorize('hospital', 'admin')
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}.`,
      });
    }
    next();
  };
}

/**
 * Ensure hospital is verified before accessing hospital features
 */
async function requireVerifiedHospital(req, res, next) {
  try {
    const hospital = await prisma.hospital.findUnique({
      where: { user_id: req.user.id },
      select: { verified_status: true },
    });
    if (!hospital || hospital.verified_status !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'Hospital account is not yet verified by admin.',
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticate, authorize, requireVerifiedHospital };
