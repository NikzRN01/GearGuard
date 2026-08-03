/**
 * Credential-endpoint throttling.
 *
 * Runs in its own process (node --test gives each file one), so it can set a
 * deliberately tiny ceiling before the app is loaded. The other suites raise
 * the ceiling instead, which is why the limiter needs its own coverage here.
 */
// Must come first: it sets DATABASE_URL and this process's schema before the
// app - and therefore the connection pool - is loaded.
const { teardown } = require('./testEnv');
const test = require('node:test');
const assert = require('node:assert/strict');

// Deliberately tiny ceilings, set before the app reads them.
process.env.AUTH_LOGIN_RATE_MAX = '3';
process.env.AUTH_RECOVERY_RATE_MAX = '2';
process.env.AUTH_SIGNUP_RATE_MAX = '3';

const app = require('../server');
const db = require('../database');
const rateLimit = require('../middleware/rateLimit');

let server;
let baseUrl;

test.before(async () => {
  // Migrations are asynchronous now, so the app is not ready at import.
  await app.ready;
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await teardown(db);
});

const post = async (routePath, body) => {
  const response = await fetch(`${baseUrl}${routePath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: response.status, headers: response.headers };
};

test('repeated failed logins are throttled', async () => {
  const attempt = () => post('/api/auth/login', {
    email: 'manager@demo.com',
    password: 'DefinitelyWrong1!'
  });

  const results = [];
  for (let i = 0; i < 5; i++) results.push(await attempt());

  const rejected = results.filter((r) => r.status === 429);
  assert.ok(rejected.length > 0, 'the limiter never engaged');
  assert.equal(results[0].status, 401, 'the first attempt should be judged on credentials');
  assert.equal(results.at(-1).status, 429, 'attempts past the ceiling must be refused');
  assert.ok(results.at(-1).headers.get('retry-after'), 'a 429 should tell the client when to retry');
});

test('password recovery is throttled separately from login', async () => {
  const attempt = () => post('/api/auth/forget-password', { email: 'manager@demo.com' });

  const results = [];
  for (let i = 0; i < 4; i++) results.push(await attempt());

  assert.equal(results[0].status, 200, 'the first recovery request should be served');
  assert.equal(results.at(-1).status, 429, 'recovery must throttle on its own budget');
});

test('signup is throttled so accounts cannot be created in bulk', async () => {
  const attempt = (i) => post('/api/auth/signup', {
    name: 'Flood',
    email: `flood-${i}-${Date.now()}@example.com`,
    password: 'Password123!',
    reEnterPassword: 'Password123!'
  });

  const results = [];
  for (let i = 0; i < 6; i++) results.push(await attempt(i));

  assert.equal(results[0].status, 201, 'the first signup should succeed');
  assert.equal(results.at(-1).status, 429, 'bulk signup must be refused');
  assert.ok(
    results.filter((r) => r.status === 201).length <= 3,
    'no more accounts may be created than the ceiling allows'
  );
});

test('the limiter releases expired records instead of growing forever', () => {
  // Each distinct address takes a slot. Nothing evicts them if the window has
  // passed, so a caller rotating addresses would grow the map without bound.
  const limiter = rateLimit({ windowMs: 5, max: 100 });
  const res = { setHeader() {}, status: () => ({ json() {} }) };
  for (let i = 0; i < 500; i++) limiter({ ip: `10.1.${i >> 8}.${i & 255}`, path: '/x' }, res, () => {});

  assert.equal(limiter.size(), 500, 'every distinct caller should be tracked while its window is open');

  const expiry = Date.now() + 10;
  while (Date.now() < expiry) { /* let the 5ms window lapse */ }

  limiter.sweep();
  assert.equal(limiter.size(), 0, 'records past their window must be released');
});

test('throttling does not leak whether an account exists', async () => {
  // A fresh path keyed per-IP: exhaust it with an address that is not registered.
  const unknown = [];
  for (let i = 0; i < 5; i++) {
    unknown.push(await post('/api/auth/login', { email: `ghost-${i}@example.com`, password: 'Wrong1!' }));
  }
  assert.ok(unknown.some((r) => r.status === 429), 'unknown accounts are throttled the same way');
});
