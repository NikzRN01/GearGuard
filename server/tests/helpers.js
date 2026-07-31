/**
 * Shared test harness.
 *
 * Must be required FIRST in every test file: it points the app at a throwaway
 * SQLite file and neutralises SMTP before `server.js` (and therefore dotenv and
 * database.js) is ever loaded.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

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
process.env.APP_BASE_URL = 'http://localhost:5173';

const app = require('../server');

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

/**
 * @param {string} method
 * @param {string} routePath e.g. '/api/teams'
 * @param {object} [options] { body, raw, headers, query }
 */
async function request(method, routePath, options = {}) {
  await start();
  const url = new URL(routePath, baseUrl);
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }

  const headers = { ...(options.headers || {}) };
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

const get = (p, options) => request('GET', p, options);
const post = (p, body, options) => request('POST', p, { ...options, body });
const put = (p, body, options) => request('PUT', p, { ...options, body });
const patch = (p, body, options) => request('PATCH', p, { ...options, body });
const del = (p, options) => request('DELETE', p, options);

/** Unique suffix so parallel/repeated runs never collide on UNIQUE columns. */
const uid = () => crypto.randomBytes(6).toString('hex');

const STRONG_PASSWORD = 'Password123!';

/** Creates a user through the public signup route and returns the full record. */
async function createUser(role = 'user', password = STRONG_PASSWORD) {
  const email = `${role}-${uid()}@example.com`;
  const signup = await post('/api/auth/signup', {
    name: `Test ${role}`,
    email,
    password,
    reEnterPassword: password,
    role
  });
  if (signup.status !== 201) {
    throw new Error(`createUser failed: ${signup.status} ${signup.text}`);
  }
  return { id: signup.body.userId, email, password, role, name: `Test ${role}` };
}

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

async function createRequest(overrides = {}) {
  const creator = overrides.created_by_user_id
    ? { id: overrides.created_by_user_id }
    : await createUser('manager');
  const target = overrides.equipment_id || overrides.work_center_id
    ? {}
    : { equipment_id: (await createEquipment()).id };

  const payload = {
    type: 'corrective',
    subject: `Request ${uid()}`,
    created_by_user_id: creator.id,
    ...target,
    ...overrides
  };
  const res = await post('/api/maintenance', payload);
  if (res.status !== 201) throw new Error(`createRequest failed: ${res.status} ${res.text}`);
  return { id: res.body.data.id, ...payload, creator };
}

module.exports = {
  app,
  dbFile,
  start,
  stop,
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
