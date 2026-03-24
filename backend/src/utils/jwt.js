const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * Sign a JWT token
 * @param {object} payload - data to encode
 * @returns {string} signed token
 */
function signToken(payload) {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

/**
 * Verify a JWT token
 * @param {string} token
 * @returns {object} decoded payload
 * @throws {JsonWebTokenError}
 */
function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

module.exports = { signToken, verifyToken };
