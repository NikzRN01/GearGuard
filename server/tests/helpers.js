/**
 * Shared test harness.
 *
 * Must be required FIRST in every test file: it points the app at a throwaway
 * SQLite file and neutralises SMTP before `server.js` (and therefore dotenv and
 * database.js) is ever loaded.
 *
 * Every API route except /api/auth now needs a session cookie, and unsafe
 * methods also need the matching CSRF token. The module-level get/post/...-
 * helpers run as a manager, which is the role most operational tests need;
 * use `as(role)` to act as somebody else, or `anon` for no session at all.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const dbFile = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'gearguard-test-')),
  'portal.db'
);

// Set before requiring the app. dotenv never overrides variables that already
// exist, so this also guarantees the developer's real Gmail creds in server/.env
// are not picked up and no live mail is sent from a test run.
process.env.SQLITE_DB_PATH = dbFile;
process.env.NODE_ENV = 'test';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.MAIL_TRANSPORT = 'json';
process.env.CLIENT_URL = 'http://localhost:5173';
// These suites log in and request resets far more often than a human would.
// The limiter itself is covered by tests/rateLimit.test.js.
process.env.AUTH_LOGIN_RATE_MAX = '100000';
process.env.AUTH_RECOVERY_RATE_MAX = '100000';
process.env.AUTH_SIGNUP_RATE_MAX = '100000';

const app = require('../server');
const db = require('../database');

let server;
let baseUrl;

async function start() {
  if (server) return baseUrl;
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  return baseUrl;
}

async function stop() {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
  server = null;
}

/** Low-level request. `session` supplies the cookie and CSRF token, if any. */
async function rawRequest(method, routePath, options = {}, session = null) {
  await start();
  const url = new URL(routePath, baseUrl);
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }

  const headers = { ...(options.headers || {}) };
  if (session?.cookie && !headers.Cookie) headers.Cookie = session.cookie;
  if (session?.csrfToken && !headers['X-CSRF-Token']) headers['X-CSRF-Token'] = session.csrfToken;

  let body;
  if (options.raw !== undefined) {
    body = options.raw;
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, { method, headers, body });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, body: json, text, headers: response.headers };
}

/** Wraps a session into the familiar get/post/put/patch/del surface. */
function agentFor(session) {
  const request = (method, p, options) => rawRequest(method, p, options, session);
  return {
    session,
    get user() { return session?.user; },
    request,
    get: (p, options) => request('GET', p, options),
    post: (p, body, options) => request('POST', p, { ...options, body }),
    put: (p, body, options) => request('PUT', p, { ...options, body }),
    patch: (p, body, options) => request('PATCH', p, { ...options, body }),
    del: (p, options) => request('DELETE', p, options)
  };
}

/** An agent with no session at all. */
const anon = agentFor(null);

const uid = () => crypto.randomBytes(6).toString('hex');
const STRONG_PASSWORD = 'Password123!';

/** Logs in and returns a session usable by agentFor(). */
async function login(email, password = STRONG_PASSWORD) {
  const res = await rawRequest('POST', '/api/auth/login', { body: { email, password } });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${res.text}`);
  const setCookie = res.headers.get('set-cookie') || '';
  return {
    cookie: setCookie.split(';')[0],
    csrfToken: res.body.csrfToken,
    user: res.body.user
  };
}

/**
 * Creates an account of any role and returns it.
 * Public signup only mints user/technician, so privileged roles are seeded
 * straight into the database - that is the admin console's job in real life.
 */
async function createUser(role = 'user', password = STRONG_PASSWORD) {
  const email = `${role}-${uid()}@example.com`;
  const name = `Test ${role}`;

  if (['user', 'technician'].includes(role)) {
    const signup = await rawRequest('POST', '/api/auth/signup', {
      body: { name, email, password, reEnterPassword: password, role }
    });
    if (signup.status !== 201) throw new Error(`createUser failed: ${signup.status} ${signup.text}`);
    return { id: signup.body.userId, email, password, role, name };
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)')
    .run(name, email, hash, role);
  return { id: Number(result.lastInsertRowid), email, password, role, name };
}

/** Creates an account of `role` and returns an agent already signed in as it. */
async function as(role) {
  const account = await createUser(role);
  const session = await login(account.email, account.password);
  return agentFor(session);
}

// Most operational tests act as a manager; created lazily and reused.
let managerAgent;
async function manager() {
  if (!managerAgent) managerAgent = await as('manager');
  return managerAgent;
}

/** Module-level helpers run as the shared manager. */
const request = async (method, p, options) => (await manager()).request(method, p, options);
const get = async (p, options) => (await manager()).get(p, options);
const post = async (p, body, options) => (await manager()).post(p, body, options);
const put = async (p, body, options) => (await manager()).put(p, body, options);
const patch = async (p, body, options) => (await manager()).patch(p, body, options);
const del = async (p, options) => (await manager()).del(p, options);

async function createTeam(name = `Team ${uid()}`) {
  const res = await post('/api/teams', { name });
  if (res.status !== 201) throw new Error(`createTeam failed: ${res.status} ${res.text}`);
  return { id: res.body.data.id, name };
}

async function createEquipment(overrides = {}) {
  const payload = {
    name: `Equipment ${uid()}`,
    serial_number: `SN-${uid()}`,
    ...overrides
  };
  const res = await post('/api/equipment', payload);
  if (res.status !== 201) throw new Error(`createEquipment failed: ${res.status} ${res.text}`);
  return { id: res.body.data.id, ...payload };
}

async function createWorkCenter(overrides = {}) {
  const payload = { name: `WC ${uid()}`, ...overrides };
  const res = await post('/api/work-centers', payload);
  if (res.status !== 201) throw new Error(`createWorkCenter failed: ${res.status} ${res.text}`);
  return { id: res.body.data.id, ...payload };
}

/**
 * Creates a request as the shared manager. The API takes the creator from the
 * session, so `created_by_user_id` is never sent.
 */
async function createRequest(overrides = {}) {
  const target = overrides.equipment_id || overrides.work_center_id
    ? {}
    : { equipment_id: (await createEquipment()).id };

  const payload = {
    type: 'corrective',
    subject: `Request ${uid()}`,
    ...target,
    ...overrides
  };
  delete payload.created_by_user_id;

  const res = await post('/api/maintenance', payload);
  if (res.status !== 201) throw new Error(`createRequest failed: ${res.status} ${res.text}`);
  return { id: res.body.data.id, ...payload };
}

module.exports = {
  app,
  db,
  dbFile,
  start,
  stop,
  login,
  agentFor,
  as,
  manager,
  anon,
  request,
  get,
  post,
  put,
  patch,
  del,
  uid,
  STRONG_PASSWORD,
  createUser,
  createTeam,
  createEquipment,
  createWorkCenter,
  createRequest
};
