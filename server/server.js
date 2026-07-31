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

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
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

// Routes
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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running', timestamp: new Date() });
});

// Export app for serverless runtimes (Vercel)
module.exports = app;

// Start server only in local/non-serverless environments
if (require.main === module && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });
}
