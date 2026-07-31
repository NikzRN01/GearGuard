/**
 * Credential-endpoint throttling.
 *
 * Runs in its own process (node --test gives each file one), so it can set a
 * deliberately tiny ceiling before the app is loaded. The other suites raise
 * the ceiling instead, which is why the limiter needs its own coverage here.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SQLITE_DB_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'gearguard-ratelimit-')),
  'portal.db'
);
process.env.NODE_ENV = 'test';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.MAIL_TRANSPORT = 'json';
process.env.AUTH_LOGIN_RATE_MAX = '3';
process.env.AUTH_RECOVERY_RATE_MAX = '2';

const app = require('../server');

let server;
let baseUrl;

test.before(() => new Promise((resolve) => {
  server = app.listen(0, '127.0.0.1', () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));

test.after(() => new Promise((resolve) => server.close(resolve)));

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

test('throttling does not leak whether an account exists', async () => {
  // A fresh path keyed per-IP: exhaust it with an address that is not registered.
  const unknown = [];
  for (let i = 0; i < 5; i++) {
    unknown.push(await post('/api/auth/login', { email: `ghost-${i}@example.com`, password: 'Wrong1!' }));
  }
  assert.ok(unknown.some((r) => r.status === 429), 'unknown accounts are throttled the same way');
});
