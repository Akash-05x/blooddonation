/**
 * Vercel Serverless Entry Point
 *
 * This file wraps the Express app for Vercel's serverless function runtime.
 * It intentionally does NOT start the HTTP server — Vercel handles that.
 * Socket.IO real-time features must be hosted on a separate persistent server
 * (e.g., Railway or Render) and connected via VITE_SOCKET_URL on the frontend.
 */
require('dotenv').config();
const app = require('../src/app');

module.exports = app;
