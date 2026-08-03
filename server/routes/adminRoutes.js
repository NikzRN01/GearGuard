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

const AUDIT_PAGE_SIZE = 50;
const AUDIT_MAX_PAGE_SIZE = 200;

/**
 * The audit trail, newest first.
 *
 * This used to be a hard LIMIT 50 with no way to reach anything older, which
 * made the log effectively write-only: an investigation covering more than the
 * last fifty events had no route to the records it needed. Paging and the
 * resource_type/action filters exist so the trail can actually be read.
 *
 * `metadata_json` is returned parsed, because that is where the before/after
 * values live and a caller should not have to re-parse it.
 */
router.get('/audit', (req, res) => {
  try {
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, AUDIT_MAX_PAGE_SIZE)
      : AUDIT_PAGE_SIZE;

    const requestedOffset = Number.parseInt(req.query.offset, 10);
    const offset = Number.isInteger(requestedOffset) && requestedOffset > 0 ? requestedOffset : 0;

    const filters = [];
    const params = [];
    if (req.query.resource_type) {
      filters.push('a.resource_type = ?');
      params.push(String(req.query.resource_type));
    }
    if (req.query.action) {
      filters.push('a.action = ?');
      params.push(String(req.query.action));
    }
    if (req.query.actor_user_id) {
      filters.push('a.actor_user_id = ?');
      params.push(String(req.query.actor_user_id));
    }
    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    const total = db.prepare(`SELECT COUNT(*) AS count FROM audit_log a ${where}`).get(...params).count;

    const events = db.prepare(`
      SELECT a.id, a.action, a.resource_type, a.resource_id, a.metadata_json, a.created_at,
             u.name AS actor_name, u.email AS actor_email
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.actor_user_id
      ${where}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset).map(({ metadata_json, ...event }) => {
      // A row written before metadata existed, or one holding unparseable JSON,
      // must not take down the whole page - the rest of the trail is still
      // evidence, and the raw text is preserved so nothing is lost.
      let metadata = null;
      if (metadata_json) {
        try {
          metadata = JSON.parse(metadata_json);
        } catch {
          metadata = { unparsed: metadata_json };
        }
      }
      return { ...event, metadata };
    });

    res.json({
      success: true,
      data: events,
      pagination: { total, limit, offset, hasMore: offset + events.length < total }
    });
  } catch (error) {
    console.error('Admin audit error:', error);
    res.status(500).json({ success: false, message: 'Failed to load audit activity' });
  }
});

module.exports = router;
