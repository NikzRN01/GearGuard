const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../database');
const nodemailer = require('nodemailer');
const {
  LIMITS,
  badRequest,
  unauthorized,
  conflict,
  forbidden,
  requiredString,
  optionalEnum,
  route,
  isUniqueViolation
} = require('../lib/validation');
const {
  authenticate,
  requireCsrf,
  createSession,
  setSessionCookie,
  clearSessionCookie,
  destroySession,
  audit
} = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');

const router = express.Router();

// Credential endpoints are the ones worth brute-forcing, so they are throttled.
// The ceilings are env-tunable so a test run can exercise the limiter directly
// instead of tripping over it while testing something else.
const LOGIN_MAX = Number(process.env.AUTH_LOGIN_RATE_MAX) || 10;
const RECOVERY_MAX = Number(process.env.AUTH_RECOVERY_RATE_MAX) || 5;
const loginRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: LOGIN_MAX });
const recoveryRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: RECOVERY_MAX });

const BCRYPT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour, matching the email copy.

// A real bcrypt hash of a value nobody can submit, used to keep the cost of a
// failed login identical whether or not the account exists.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS);

// Email validation regex
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Password validation function
const validatePassword = (password) => {
  const errors = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return errors;
};

/** Validates a submitted password and returns it, or throws a 400. */
const assertPasswordPolicy = (password, field) => {
  const value = requiredString(password, field, LIMITS.password);
  const errors = validatePassword(value);
  if (errors.length > 0) throw badRequest(errors.join('. '));
  return value;
};

// Case is preserved so accounts created before this validation existed keep
// working; comparisons that need to be case-insensitive lower-case explicitly.
const normalizeEmail = (value, field = 'Email') => {
  const email = requiredString(value, field, LIMITS.email);
  if (!emailRegex.test(email)) throw badRequest('Invalid email format');
  return email;
};

/**
 * Built lazily so a missing SMTP configuration cannot break module loading, and
 * so tests can opt into a transport that never opens a network connection.
 */
let transporter;
const getTransporter = () => {
  if (transporter) return transporter;

  const useJsonTransport =
    process.env.MAIL_TRANSPORT === 'json' || !process.env.SMTP_USER || !process.env.SMTP_PASS;

  if (useJsonTransport) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('SMTP is not configured; password reset emails will not be delivered.');
    }
    transporter = nodemailer.createTransport({ jsonTransport: true });
  } else {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  return transporter;
};

const appBaseUrl = () =>
  (process.env.CLIENT_URL || process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/+$/, '');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/** Escapes values interpolated into the HTML email body. */
const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

// Sign Up Route
router.post('/signup', route(async (req, res) => {
  const { name, email, password, reEnterPassword, role } = req.body || {};

  // Validate required fields
  if (!name || !email || !password || !reEnterPassword) {
    throw badRequest('All fields are required');
  }

  const cleanName = requiredString(name, 'Name', LIMITS.name);
  const cleanEmail = normalizeEmail(email);

  // Public signup can never mint a privileged account: manager and admin are
  // granted from the admin console, not claimed at the door.
  const validRoles = ['technician', 'user'];
  const invalidRole = badRequest('Public signup is limited to user or technician accounts');
  if (role !== undefined && role !== null && role !== '' && typeof role !== 'string') {
    throw invalidRole;
  }
  const cleanRole = role ? String(role) : '';
  if (cleanRole && !validRoles.includes(cleanRole)) throw invalidRole;

  // Check if passwords match
  if (password !== reEnterPassword) {
    throw badRequest('Passwords do not match');
  }

  // Validate password strength
  const cleanPassword = assertPasswordPolicy(password, 'Password');

  // Check if user already exists
  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (existingUser) {
    throw conflict('Account already exists with this email');
  }

  const hashedPassword = await bcrypt.hash(cleanPassword, BCRYPT_ROUNDS);

  let result;
  try {
    result = db
      .prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)')
      .run(cleanName, cleanEmail, hashedPassword, cleanRole || 'user');
  } catch (error) {
    // Two concurrent signups can both pass the check above; the UNIQUE index
    // is the real arbiter.
    if (isUniqueViolation(error)) throw conflict('Account already exists with this email');
    throw error;
  }

  res.status(201).json({
    success: true,
    message: 'User created successfully',
    userId: result.lastInsertRowid
  });
}));

// Login Route
router.post('/login', loginRateLimit, route(async (req, res) => {
  const { email, password, role } = req.body || {};

  // Validate required fields
  if (!email || !password) {
    throw badRequest('Email and password are required');
  }
  if (typeof email !== 'string' || typeof password !== 'string') {
    throw badRequest('Email and password must be text');
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim());

  // Compare against a throwaway hash when the account does not exist, so both
  // the response time and the status code stay identical for unknown emails
  // and wrong passwords.
  const storedHash = user ? user.password : DUMMY_PASSWORD_HASH;
  const isPasswordValid = await bcrypt.compare(password, storedHash);

  if (!user || !isPasswordValid) {
    throw unauthorized('Invalid email or password');
  }

  // Check if user role matches the login role
  if (role && user.role !== role) {
    throw forbidden(`This account is registered as a ${user.role}, not a ${role}`);
  }

  // Issue the session as an HttpOnly cookie; the CSRF token is returned in the
  // body so the client can echo it on unsafe requests.
  const session = createSession(user.id);
  setSessionCookie(res, session.token);
  audit(user.id, 'auth.login', 'session', null, { role: user.role });

  // Successful login - return user data (excluding password)
  const { password: _, ...userWithoutPassword } = user;

  res.status(200).json({
    success: true,
    message: 'Login successful',
    user: userWithoutPassword,
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt
  });
}));

// Who am I - lets the client rehydrate identity from the cookie alone.
router.get('/me', authenticate, route((req, res) => {
  res.json({
    success: true,
    user: req.user,
    csrfToken: req.authSession.csrfToken,
    expiresAt: req.authSession.expiresAt
  });
}));

router.post('/logout', authenticate, requireCsrf, route((req, res) => {
  audit(req.user.id, 'auth.logout', 'session');
  destroySession(req);
  clearSessionCookie(res);
  res.json({ success: true, message: 'Logged out successfully' });
}));

// Forget Password Route
router.post('/forget-password', recoveryRateLimit, route(async (req, res) => {
  const { email } = req.body || {};

  if (!email) {
    throw badRequest('Email is required');
  }
  const cleanEmail = normalizeEmail(email);

  const user = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(cleanEmail);

  // Always answer identically, whether or not the account exists.
  const genericResponse = {
    success: true,
    message: 'If an account exists for that address, a password reset email has been sent.'
  };

  if (!user) {
    return res.status(200).json(genericResponse);
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();

  const issue = db.transaction(() => {
    // A new request supersedes any outstanding token for this account.
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);
    db.prepare(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)'
    ).run(user.id, hashToken(token), expiresAt);
  });
  issue();

  // The token alone identifies the account, so the link carries nothing else.
  const resetUrl = `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;

  try {
    await getTransporter().sendMail({
      from: '"GearGuard Team" <noreply@gearguard.com>',
      to: user.email,
      subject: 'Reset your password for GearGuard',
      text: `Hello ${user.name}, open this link to reset your GearGuard password: ${resetUrl} (valid for 1 hour).`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>Hello <strong>${escapeHtml(user.name)}</strong>,</p>
          <p>You requested to reset your password for your GearGuard account.</p>
          <p>Click the button below to reset your password:</p>
          <a href="${escapeHtml(resetUrl)}"
             style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">
            Reset Password
          </a>
          <p style="color: #666; font-size: 14px;">If you didn't request this, please ignore this email.</p>
          <p style="color: #666; font-size: 14px;">This link will expire in 1 hour.</p>
        </div>
      `
    });
  } catch (error) {
    // Never let a mail outage disclose whether the address is registered.
    console.error('Password reset email could not be sent:', error.message);
  }

  // Test builds surface the token so the flow can be exercised end to end.
  // This must never happen outside NODE_ENV=test.
  if (process.env.NODE_ENV === 'test') {
    return res.status(200).json({ ...genericResponse, resetToken: token });
  }

  res.status(200).json(genericResponse);
}));

// Reset Password Route
router.post('/reset-password', recoveryRateLimit, route(async (req, res) => {
  const { token, newPassword, confirmPassword } = req.body || {};

  if (!newPassword || !confirmPassword) {
    throw badRequest('New password and confirm password are required');
  }

  if (newPassword !== confirmPassword) {
    throw badRequest('Passwords do not match');
  }

  const cleanPassword = assertPasswordPolicy(newPassword, 'Password');

  // Possession of the emailed token is the only proof of ownership. It also
  // identifies the account, so no email address is asked for or trusted here.
  const cleanToken = requiredString(token, 'Reset token', 200);
  const invalidToken = badRequest('This password reset link is invalid or has expired');

  const record = db.prepare(`
    SELECT prt.id, prt.user_id, prt.expires_at, prt.used_at
    FROM password_reset_tokens prt
    JOIN users u ON u.id = prt.user_id
    WHERE prt.token_hash = ?
  `).get(hashToken(cleanToken));

  if (!record || record.used_at) throw invalidToken;
  if (Date.parse(record.expires_at) <= Date.now()) throw invalidToken;

  const hashedPassword = await bcrypt.hash(cleanPassword, BCRYPT_ROUNDS);

  const apply = db.transaction(() => {
    // Re-check inside the transaction so two concurrent resets cannot both win.
    const claimed = db.prepare(
      'UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL'
    ).run(record.id);
    if (claimed.changes !== 1) return false;

    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, record.user_id);
    // Any other outstanding token for this account is now void, and so is every
    // active session: a password change must log out anyone already signed in.
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ? AND id != ?')
      .run(record.user_id, record.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(record.user_id);
    return true;
  });

  if (!apply()) throw invalidToken;

  audit(record.user_id, 'auth.password_reset', 'user', record.user_id);

  res.status(200).json({
    success: true,
    message: 'Password reset successfully'
  });
}));

module.exports = router;
