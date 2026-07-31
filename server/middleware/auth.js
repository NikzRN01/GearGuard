const crypto = require('crypto');
const db = require('../database');

const SESSION_COOKIE = 'gg_session';
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS) || 8 * 60 * 60 * 1000;

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const parseCookies = (header = '') => Object.fromEntries(
  header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const separator = part.indexOf('=');
    const key = separator >= 0 ? part.slice(0, separator) : part;
    const value = separator >= 0 ? part.slice(separator + 1) : '';
    return [decodeURIComponent(key), decodeURIComponent(value)];
  })
);

const cookieOptions = () => [
  'HttpOnly',
  'Path=/',
  'SameSite=Lax',
  process.env.NODE_ENV === 'production' ? 'Secure' : null
].filter(Boolean);

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const csrfToken = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare('DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP').run();
  db.prepare('INSERT INTO sessions (token_hash, csrf_token, user_id, expires_at) VALUES (?, ?, ?, ?)')
    .run(hashToken(token), csrfToken, userId, expiresAt);
  return { token, csrfToken, expiresAt };
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', [`${SESSION_COOKIE}=${encodeURIComponent(token)}`, ...cookieOptions(), `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`].join('; '));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', [`${SESSION_COOKIE}=`, ...cookieOptions(), 'Max-Age=0'].join('; '));
}

function getSession(req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  return db.prepare(`
    SELECT s.id AS session_id, s.csrf_token, s.expires_at,
           u.id, u.name, u.email, u.role, u.avatar_url, u.created_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP
  `).get(hashToken(token)) || null;
}

function authenticate(req, res, next) {
  const session = getSession(req);
  if (!session) {
    clearSessionCookie(res);
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  req.user = {
    id: session.id,
    name: session.name,
    email: session.email,
    role: session.role,
    avatar_url: session.avatar_url,
    created_at: session.created_at
  };
  req.authSession = { id: session.session_id, csrfToken: session.csrf_token, expiresAt: session.expires_at };
  db.prepare('UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?').run(session.session_id);
  next();
}

function requireCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const supplied = req.get('x-csrf-token') || '';
  const expected = req.authSession?.csrfToken || '';
  const valid = supplied.length === expected.length && supplied.length > 0 && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  if (!valid) return res.status(403).json({ success: false, message: 'Invalid CSRF token' });
  next();
}

const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'You do not have permission to perform this action' });
  }
  next();
};

function destroySession(req) {
  if (req.authSession?.id) db.prepare('DELETE FROM sessions WHERE id = ?').run(req.authSession.id);
}

function audit(actorUserId, action, resourceType, resourceId = null, metadata = null) {
  db.prepare('INSERT INTO audit_log (actor_user_id, action, resource_type, resource_id, metadata_json) VALUES (?, ?, ?, ?, ?)')
    .run(actorUserId || null, action, resourceType, resourceId == null ? null : String(resourceId), metadata ? JSON.stringify(metadata) : null);
}

module.exports = {
  SESSION_COOKIE,
  authenticate,
  authorize,
  requireCsrf,
  createSession,
  setSessionCookie,
  clearSessionCookie,
  destroySession,
  audit
};
