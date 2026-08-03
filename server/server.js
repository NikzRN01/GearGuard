const express = require('express');
const cors = require('cors');
require('dotenv').config();
const authRoutes = require('./routes/authRoutes');
const equipmentRoutes = require('./routes/equipmentRoutes');
const teamRoutes = require('./routes/teamRoutes');
const maintenanceRoutes = require('./routes/maintenanceRoutes');
const workCenterRoutes = require('./routes/workCenterRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { authenticate, requireCsrf } = require('./middleware/auth');
const { HttpError } = require('./lib/validation');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;

/**
 * Migrations and seeding, started at import and awaited before any request is
 * served.
 *
 * With SQLite this happened synchronously during `require`, so by the time the
 * module finished loading the schema existed. PostgreSQL is async, so the
 * promise is held here and every request gates on it - otherwise a serverless
 * instance could answer a query against a database it has not migrated yet.
 */
const ready = db.initializeDatabase();

// A rejection here means the process can never serve traffic. Log it now rather
// than leaving an unhandled rejection to surface without context; requests get
// the same error through the gate below.
ready.catch((error) => {
  console.error('Database initialization failed:', error.message);
});

// Behind a proxy (Vercel, nginx, a load balancer) every request arrives from the
// proxy's address, so req.ip is identical for everyone and the auth rate limiter
// degrades into a global one - a single attacker would lock out every user.
// TRUST_PROXY takes any value Express accepts ('1', 'loopback', a CIDR list).
// It is off by default because trusting X-Forwarded-For when nothing strips it
// lets a client forge its own address and bypass the limiter entirely.
const trustProxy = process.env.TRUST_PROXY ?? (process.env.VERCEL ? '1' : '');
if (trustProxy) {
  app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
}

// Browsers may only call this API from an allow-listed origin. Sessions travel
// as cookies, so this must stay an exact list - a wildcard cannot be combined
// with credentials. Set CORS_ALLOWED_ORIGINS in every deployed environment;
// the default covers local development only.
const allowedOrigins = new Set(
  (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);
if (process.env.CLIENT_URL) allowedOrigins.add(process.env.CLIENT_URL.trim());

app.use(cors({
  origin(origin, callback) {
    // No Origin header: curl, server-to-server, same-origin navigations.
    if (!origin) return callback(null, true);
    // Reject by omitting the CORS headers rather than raising, so the browser
    // blocks the response and the server still answers cleanly instead of 500.
    return callback(null, allowedOrigins.has(origin));
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'X-CSRF-Token']
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// No route runs before migrations have finished. Resolved after the first boot,
// so this costs one already-settled promise per request thereafter.
app.use(async (req, res, next) => {
  try {
    await ready;
    next();
  } catch {
    res.status(503).json({ success: false, message: 'Service is starting up' });
  }
});

// Routes. Everything except /api/auth requires a session and, for unsafe
// methods, a matching CSRF token.
app.use('/api/auth', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
}, authRoutes);
app.use('/api/equipment', authenticate, requireCsrf, equipmentRoutes);
app.use('/api/teams', authenticate, requireCsrf, teamRoutes);
app.use('/api/maintenance', authenticate, requireCsrf, maintenanceRoutes);
app.use('/api/work-centers', authenticate, requireCsrf, workCenterRoutes);
app.use('/api/admin', authenticate, requireCsrf, adminRoutes);

// Base routes for platform checks and manual browser visits
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'GearGuard backend is running',
    health: '/api/health'
  });
});

app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'GearGuard API is running',
    health: '/api/health'
  });
});

// Health check. A process that cannot reach its database is not healthy, so
// this actually queries rather than reporting on the process alone - an
// orchestrator or uptime monitor needs the difference.
app.get('/api/health', async (req, res) => {
  try {
    await db.healthcheck();
    res.json({ status: 'ok', database: 'ok', timestamp: new Date() });
  } catch (error) {
    console.error('Health check failed:', error.message);
    res.status(503).json({ status: 'degraded', database: 'unreachable', timestamp: new Date() });
  }
});

// Unknown paths answer in JSON, matching the rest of the API.
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
});

// Central error handler. Only messages raised deliberately are echoed back;
// everything else becomes a generic 500 so internals are never disclosed.
// The unused `next` is required: Express identifies error handlers by arity.
app.use((error, req, res, next) => {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ success: false, message: error.message });
  }

  // Body parser failures (malformed JSON, oversized payload).
  if (error && error.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Request body is too large' });
  }
  if (error && (error.type === 'entity.parse.failed' || error instanceof SyntaxError)) {
    return res.status(400).json({ success: false, message: 'Request body is not valid JSON' });
  }

  console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, error);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// Export app for serverless runtimes (Vercel). `ready` is attached so tests and
// tooling can await migrations without reaching into the database module.
module.exports = app;
module.exports.ready = ready;

// Start server only when run directly in a local/non-serverless environment.
// Importing this module (serverless runtimes, tests, tooling) must never bind a port.
if (require.main === module && !process.env.VERCEL) {
  const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });

  // Stop accepting connections, let in-flight requests finish, then hand the
  // pooled PostgreSQL connections back before exiting. Without this a redeploy
  // severs live requests and leaves connections held until the server times
  // them out - which matters on Neon, where the branch has a connection ceiling.
  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down.`);
    server.close(async () => {
      try {
        await db.close();
      } catch (error) {
        console.error('Error closing the database pool:', error.message);
      }
      process.exit(0);
    });

    // A client holding a connection open must not block the deploy forever.
    setTimeout(() => {
      console.error('Shutdown timed out, exiting.');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
