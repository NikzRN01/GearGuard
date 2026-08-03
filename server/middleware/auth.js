const crypto = require('crypto');
const db = require('../database');

const SESSION_COOKIE = 'gg_session';
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS) || 8 * 60 * 60 * 1000;

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// A cookie header is attacker-controlled, so a value that is not valid
// percent-encoding must not throw: `Cookie: gg_session=%` would otherwise take
// down every request with a 500. Undecodable parts are kept verbatim, which can
// only ever fail to match a session token.
const decodeCookiePart = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const parseCookies = (header = '') => Object.fromEntries(
  String(header || '').split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const separator = part.indexOf('=');
    const key = separator >= 0 ? part.slice(0, separator) : part;
    const value = separator >= 0 ? part.slice(separator + 1) : '';
    return [decodeCookiePart(key), decodeCookiePart(value)];
  })
);

const cookieOptions = () => [
  'HttpOnly',
  'Path=/',
  'SameSite=Lax',
  process.env.NODE_ENV === 'production' ? 'Secure' : null
].filter(Boolean);

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const csrfToken = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await db.run('DELETE FROM sessions WHERE expires_at <= now()');
  await db.run('INSERT INTO sessions (token_hash, csrf_token, user_id, expires_at) VALUES (?, ?, ?, ?)', [
    hashToken(token), csrfToken, userId, expiresAt
  ]);
  return { token, csrfToken, expiresAt };
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', [`${SESSION_COOKIE}=${encodeURIComponent(token)}`, ...cookieOptions(), `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`].join('; '));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', [`${SESSION_COOKIE}=`, ...cookieOptions(), 'Max-Age=0'].join('; '));
}

async function getSession(req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  // `u.id` is selected last so it wins the name collision with `s.id`, which is
  // aliased away - the caller expects `id` to mean the user.
  return await db.get(`
    SELECT s.id AS session_id, s.csrf_token, s.expires_at,
           u.id, u.name, u.email, u.role, u.avatar_url, u.created_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > now()
  `, [hashToken(token)]) || null;
}

async function authenticate(req, res, next) {
  try {
    const session = await getSession(req);
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
    await db.run('UPDATE sessions SET last_seen_at = now() WHERE id = ?', [session.session_id]);
    next();
  } catch (error) {
    next(error);
  }
}

function requireCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // Compare the bytes that actually arrived. Node decodes header values as
  // latin1, so 'latin1' reconstructs them exactly; decoding as UTF-8 instead
  // would re-expand any high byte and make timingSafeEqual throw on a length
  // mismatch, turning a forgery attempt into a 500 rather than the 403 it
  // deserves. Tokens we issue are base64url, where both readings agree.
  const supplied = Buffer.from(req.get('x-csrf-token') || '', 'latin1');
  const expected = Buffer.from(req.authSession?.csrfToken || '', 'latin1');
  const valid = expected.length > 0
    && supplied.length === expected.length
    && crypto.timingSafeEqual(supplied, expected);
  if (!valid) return res.status(403).json({ success: false, message: 'Invalid CSRF token' });
  next();
}

const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'You do not have permission to perform this action' });
  }
  next();
};

async function destroySession(req) {
  if (req.authSession?.id) await db.run('DELETE FROM sessions WHERE id = ?', [req.authSession.id]);
}

/**
 * Writes an audit entry.
 *
 * Callers await this before responding, so a successful response means the
 * trail was written. A failure here is logged rather than thrown: losing the
 * record of an action is bad, but failing the action itself after it has
 * already been committed would be worse, and would leave the caller believing
 * nothing happened.
 */
async function audit(actorUserId, action, resourceType, resourceId = null, metadata = null) {
  try {
    await db.run(
      'INSERT INTO audit_log (actor_user_id, action, resource_type, resource_id, metadata_json) VALUES (?, ?, ?, ?, ?)',
      [
        actorUserId || null,
        action,
        resourceType,
        resourceId == null ? null : String(resourceId),
        metadata ? JSON.stringify(metadata) : null
      ]
    );
  } catch (error) {
    console.error(`Failed to write audit entry ${action}:`, error.message);
  }
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
