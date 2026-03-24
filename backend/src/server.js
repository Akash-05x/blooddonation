require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { initSockets } = require('./sockets');
const config = require('./config');
const prisma = require('./config/prisma');

const server = http.createServer(app);

// ── Socket.io setup ───────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: config.clientOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

initSockets(io);

// Start background workers
const { startFailureDetector } = require('./services/failureDetector');
startFailureDetector(io);

// Expose io globally via app so controllers can access it via req.app.get('io')
app.set('io', io);

// ── Start server ──────────────────────────────────────────────────────────────
async function start() {
  try {
    // Verify DB connection
    await prisma.$connect();
    console.log('✅ Database connected successfully.');

    // Handle port-in-use and other server-level errors gracefully
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${config.port} is already in use.`);
        console.error('   Stop the existing instance first, then restart.');
      } else {
        console.error('❌ Server error:', err.message);
      }
      process.exit(1);
    });

    server.listen(config.port, () => {
      console.log(`\n🩸 Blood Request API running at http://localhost:${config.port}`);
      console.log(`📡 Socket.io listening on http://localhost:${config.port}`);
      console.log(`🌍 Environment: ${config.nodeEnv}`);
      console.log(`📧 OTP Mode: ${config.otp.consoleMode ? 'Console (dev)' : 'Email (SMTP)'}\n`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(async () => {
    await prisma.$disconnect();
    console.log('Server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('\nSIGINT received. Shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

// ── Safety net for unhandled async errors ────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception:', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled promise rejection:', reason);
});

start();
