const express = require('express');
const cors = require('cors');
require('dotenv').config();
const authRoutes = require('./routes/authRoutes');
const equipmentRoutes = require('./routes/equipmentRoutes');
const teamRoutes = require('./routes/teamRoutes');
const maintenanceRoutes = require('./routes/maintenanceRoutes');
const workCenterRoutes = require('./routes/workCenterRoutes');
const { HttpError } = require('./lib/validation');

const app = express();
const PORT = process.env.PORT || 5000;

// Browsers may only call this API from an allow-listed origin. Set
// CORS_ALLOWED_ORIGINS (comma separated) in every deployed environment;
// the default covers local development only.
const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const allowedOrigins = new Set(
  (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);
if (process.env.APP_BASE_URL) allowedOrigins.add(process.env.APP_BASE_URL.trim());
if (allowedOrigins.size === 0) DEFAULT_ORIGINS.forEach((origin) => allowedOrigins.add(origin));

// Middleware
app.use(cors({
  origin(origin, callback) {
    // No Origin header: curl, server-to-server, same-origin navigations.
    if (!origin) return callback(null, true);
    if (allowedOrigins.has('*') || allowedOrigins.has(origin)) return callback(null, true);
    // Reject by omitting CORS headers rather than erroring, so the browser
    // blocks the response and the server still answers cleanly.
    return callback(null, false);
  },
  credentials: true
}));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/work-centers', workCenterRoutes);

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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running', timestamp: new Date() });
});

// Unknown paths answer in JSON, matching the rest of the API.
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
});

// Central error handler. Only messages we raised deliberately are echoed back;
// everything else becomes a generic 500 so internals are never disclosed.
// eslint-disable-next-line no-unused-vars
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

// Export app for serverless runtimes (Vercel)
module.exports = app;

// Start server only when run directly in a local/non-serverless environment.
// Importing this module (serverless runtimes, tests, tooling) must never bind a port.
if (!process.env.VERCEL && require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });
}
