const express = require('express');
const db = require('../database');
const { authorize, audit } = require('../middleware/auth');

const router = express.Router();
router.use(authorize('admin'));

router.get('/overview', (req, res) => {
  try {
    const roleRows = db.prepare('SELECT role, COUNT(*) AS count FROM users GROUP BY role').all();
    const roles = Object.fromEntries(roleRows.map((row) => [row.role, row.count]));
    const activeSessions = db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE expires_at > CURRENT_TIMESTAMP').get().count;
    const recentAuditEvents = db.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE created_at >= datetime('now', '-24 hours')").get().count;
    const pendingPasswordResets = db.prepare('SELECT COUNT(*) AS count FROM password_reset_tokens WHERE used_at IS NULL AND expires_at > CURRENT_TIMESTAMP').get().count;

    res.json({
      success: true,
      data: {
        totalUsers: roleRows.reduce((total, row) => total + row.count, 0),
        roles,
        activeSessions,
        recentAuditEvents,
        pendingPasswordResets
      }
    });
  } catch (error) {
    console.error('Admin overview error:', error);
    res.status(500).json({ success: false, message: 'Failed to load administration overview' });
  }
});

router.get('/users', (req, res) => {
  try {
    const users = db.prepare('SELECT id, name, email, role, created_at FROM users ORDER BY name').all();
    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ success: false, message: 'Failed to load user access data' });
  }
});

router.patch('/users/:id/role', (req, res) => {
  const userId = Number(req.params.id);
  const role = String(req.body?.role || '').trim().toLowerCase();
  const assignableRoles = ['user', 'technician', 'manager'];

  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ success: false, message: 'A valid user is required' });
  if (!assignableRoles.includes(role)) return res.status(400).json({ success: false, message: 'Only user, technician, or manager access can be assigned here' });

  const target = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(userId);
  if (!target) return res.status(404).json({ success: false, message: 'User not found' });
  if (target.id === req.user.id || target.role === 'admin') {
    return res.status(403).json({ success: false, message: 'Administrator access is protected and cannot be changed here' });
  }

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  audit(req.user.id, 'admin.user.role.update', 'user', userId, { from: target.role, to: role });
  res.json({ success: true, data: { ...target, role }, message: 'Access role updated. Existing sessions were revoked.' });
});

router.get('/audit', (req, res) => {
  try {
    const events = db.prepare(`
      SELECT a.id, a.action, a.resource_type, a.resource_id, a.created_at,
             u.name AS actor_name, u.email AS actor_email
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.actor_user_id
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT 50
    `).all();
    res.json({ success: true, data: events });
  } catch (error) {
    console.error('Admin audit error:', error);
    res.status(500).json({ success: false, message: 'Failed to load audit activity' });
  }
});

module.exports = router;
