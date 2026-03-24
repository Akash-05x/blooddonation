const config = require('../config');

/**
 * Global error handler middleware.
 * Catches all errors thrown or passed via next(err).
 */
function errorHandler(err, req, res, next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  if (config.nodeEnv === 'development') {
    console.error(err.stack);
  }

  // Prisma-specific errors
  if (err.code === 'P2002') {
    return res.status(409).json({
      success: false,
      message: 'A record with this data already exists.',
      field: err.meta?.target,
    });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ success: false, message: 'Record not found.' });
  }

  // Validation errors (express-validator)
  if (err.type === 'validation') {
    return res.status(400).json({ success: false, message: err.message, errors: err.errors });
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error.';

  res.status(status).json({ success: false, message });
}

/**
 * 404 handler — must be placed before errorHandler
 */
function notFoundHandler(req, res) {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found.` });
}

module.exports = { errorHandler, notFoundHandler };
