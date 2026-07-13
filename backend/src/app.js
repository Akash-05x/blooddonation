const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const config = require('./config');

// Routes
const authRoutes = require('./routes/auth');
const donorRoutes = require('./routes/donor');
const hospitalRoutes = require('./routes/hospital');
const adminRoutes = require('./routes/admin');

// Middleware
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

// ── Security & general middleware ────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: config.clientOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
// High limit for tracking sessions: GPS updates, route fetches, and map loads
// are all high-frequency during an active emergency (~5-15 req/min per user).
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 800,                  // Raised from 200 → 800 to support active tracking sessions
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
  skip: (req) => req.path === '/donor/location', // Location endpoint has its own limiter
});

// Dedicated limiter for GPS location updates (REST fallback for socket failures).
// These fire every 3-5 seconds during active tracking → high frequency is expected.
const locationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Location update rate limit exceeded.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts. Please try again in 15 minutes.' },
});

app.use('/api', globalLimiter);
app.use('/api/donor/location', locationLimiter); // High-frequency GPS updates
app.use('/api/register', authLimiter);
app.use('/api/login', authLimiter);
app.use('/api/verify-otp', authLimiter);
app.use('/api/forgot-password', authLimiter);
app.use('/api/reset-password', authLimiter);


// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ success: true, message: 'Blood Request API is running.', timestamp: new Date().toISOString() });
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api', authRoutes);
app.use('/api/donor', donorRoutes);
app.use('/api/hospital', hospitalRoutes);
app.use('/api/admin', adminRoutes);

// ── Error handling ────────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
