const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');

test.after(() => h.stop());

test('signup: creates a user with a strong password', async () => {
  const email = `signup-${h.uid()}@example.com`;
  const res = await h.post('/api/auth/signup', {
    name: 'Ada Lovelace',
    email,
    password: h.STRONG_PASSWORD,
    reEnterPassword: h.STRONG_PASSWORD
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.ok(Number.isInteger(res.body.userId));
});

test('signup: defaults the role to "user"', async () => {
  const user = await h.createUser('user');
  const login = await h.post('/api/auth/login', { email: user.email, password: user.password });
  assert.equal(login.body.user.role, 'user');
});

test('signup: rejects missing fields', async () => {
  const res = await h.post('/api/auth/signup', { name: 'X', email: 'x@y.com' });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /required/i);
});

test('signup: rejects an invalid role', async () => {
  const res = await h.post('/api/auth/signup', {
    name: 'X',
    email: `role-${h.uid()}@example.com`,
    password: h.STRONG_PASSWORD,
    reEnterPassword: h.STRONG_PASSWORD,
    role: 'superadmin'
  });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /Invalid role/i);
});

test('signup: rejects a malformed email', async () => {
  const res = await h.post('/api/auth/signup', {
    name: 'X',
    email: 'not-an-email',
    password: h.STRONG_PASSWORD,
    reEnterPassword: h.STRONG_PASSWORD
  });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /email/i);
});

test('signup: rejects mismatched passwords', async () => {
  const res = await h.post('/api/auth/signup', {
    name: 'X',
    email: `mismatch-${h.uid()}@example.com`,
    password: h.STRONG_PASSWORD,
    reEnterPassword: 'Different123!'
  });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /do not match/i);
});

test('signup: enforces every documented password rule', async () => {
  const cases = [
    ['Short1!', /8 characters/i],
    ['alllowercase1!', /uppercase/i],
    ['ALLUPPERCASE1!', /lowercase/i],
    ['NoSpecialChar1', /special/i]
  ];
  for (const [password, expected] of cases) {
    const res = await h.post('/api/auth/signup', {
      name: 'X',
      email: `pw-${h.uid()}@example.com`,
      password,
      reEnterPassword: password
    });
    assert.equal(res.status, 400, `expected 400 for ${password}, got ${res.status}`);
    assert.match(res.body.message, expected);
  }
});

test('signup: rejects a duplicate email with 409', async () => {
  const user = await h.createUser('user');
  const res = await h.post('/api/auth/signup', {
    name: 'Dup',
    email: user.email,
    password: h.STRONG_PASSWORD,
    reEnterPassword: h.STRONG_PASSWORD
  });
  assert.equal(res.status, 409);
});

test('signup: never stores the password in plain text', async () => {
  const user = await h.createUser('user');
  const Database = require('better-sqlite3');
  const db = new Database(h.dbFile, { readonly: true });
  const row = db.prepare('SELECT password FROM users WHERE email = ?').get(user.email);
  db.close();
  assert.notEqual(row.password, user.password);
  assert.match(row.password, /^\$2[aby]\$/);
});

test('login: succeeds and never returns the password hash', async () => {
  const user = await h.createUser('technician');
  const res = await h.post('/api/auth/login', { email: user.email, password: user.password });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.email, user.email);
  assert.equal(res.body.user.password, undefined);
});

test('login: rejects a wrong password with 401', async () => {
  const user = await h.createUser('user');
  const res = await h.post('/api/auth/login', { email: user.email, password: 'Wrong123!' });
  assert.equal(res.status, 401);
});

// Deliberately 401, not 404: a distinct "account not found" response would let
// anyone test whether an email address is registered. See the timing/status
// enumeration test in hardening.test.js.
test('login: returns 401 for an unknown account, indistinguishable from a wrong password', async () => {
  const res = await h.post('/api/auth/login', { email: `ghost-${h.uid()}@example.com`, password: 'Whatever1!' });
  assert.equal(res.status, 401);
});

test('login: rejects a role mismatch', async () => {
  const user = await h.createUser('technician');
  const res = await h.post('/api/auth/login', { email: user.email, password: user.password, role: 'manager' });
  assert.equal(res.status, 403);
});

test('login: requires both email and password', async () => {
  const res = await h.post('/api/auth/login', { email: 'a@b.com' });
  assert.equal(res.status, 400);
});

test('reset-password: enforces password rules and matching confirmation', async () => {
  const user = await h.createUser('user');

  const mismatch = await h.post('/api/auth/reset-password', {
    email: user.email,
    newPassword: 'NewPassword1!',
    confirmPassword: 'Other1!'
  });
  assert.equal(mismatch.status, 400);

  const weak = await h.post('/api/auth/reset-password', {
    email: user.email,
    newPassword: 'weak',
    confirmPassword: 'weak'
  });
  assert.equal(weak.status, 400);
});

test('SECURITY: reset-password must not accept email alone as proof of identity', async () => {
  const victim = await h.createUser('manager');
  const attackerPassword = 'Attacker123!';

  const res = await h.post('/api/auth/reset-password', {
    email: victim.email,
    newPassword: attackerPassword,
    confirmPassword: attackerPassword
  });

  assert.notEqual(
    res.status,
    200,
    'anyone who knows an email address could take over that account'
  );

  const login = await h.post('/api/auth/login', { email: victim.email, password: attackerPassword });
  assert.notEqual(login.status, 200, 'the victim account was taken over without any token');
});

test('reset-password: a valid single-use token resets the password', async () => {
  const user = await h.createUser('user');

  const forgot = await h.post('/api/auth/forget-password', { email: user.email });
  assert.equal(forgot.status, 200);
  const token = forgot.body.resetToken || forgot.body.data?.resetToken;
  assert.ok(token, 'test mail transport should expose the generated token');

  const newPassword = 'Rotated123!';
  const reset = await h.post('/api/auth/reset-password', {
    email: user.email,
    token,
    newPassword,
    confirmPassword: newPassword
  });
  assert.equal(reset.status, 200);

  const login = await h.post('/api/auth/login', { email: user.email, password: newPassword });
  assert.equal(login.status, 200);

  const old = await h.post('/api/auth/login', { email: user.email, password: user.password });
  assert.notEqual(old.status, 200, 'the previous password must stop working');

  const replay = await h.post('/api/auth/reset-password', {
    email: user.email,
    token,
    newPassword: 'Replayed123!',
    confirmPassword: 'Replayed123!'
  });
  assert.notEqual(replay.status, 200, 'a reset token must be single use');
});

test('reset-password: rejects a forged token', async () => {
  const user = await h.createUser('user');
  await h.post('/api/auth/forget-password', { email: user.email });

  const res = await h.post('/api/auth/reset-password', {
    email: user.email,
    token: 'a'.repeat(64),
    newPassword: 'Forged123!',
    confirmPassword: 'Forged123!'
  });
  assert.notEqual(res.status, 200);
});

test('reset-password: a token issued for one account cannot reset another', async () => {
  const victim = await h.createUser('manager');
  const attacker = await h.createUser('user');

  const forgot = await h.post('/api/auth/forget-password', { email: attacker.email });
  const token = forgot.body.resetToken || forgot.body.data?.resetToken;
  assert.ok(token);

  const res = await h.post('/api/auth/reset-password', {
    email: victim.email,
    token,
    newPassword: 'Crossed123!',
    confirmPassword: 'Crossed123!'
  });
  assert.notEqual(res.status, 200);
});

test('forget-password: does not disclose whether an account exists', async () => {
  const user = await h.createUser('user');
  const known = await h.post('/api/auth/forget-password', { email: user.email });
  const unknown = await h.post('/api/auth/forget-password', { email: `nobody-${h.uid()}@example.com` });

  assert.equal(known.status, unknown.status, 'status code leaks account existence');
  assert.equal(known.body.message, unknown.body.message, 'response message leaks account existence');
});

test('forget-password: requires an email', async () => {
  const res = await h.post('/api/auth/forget-password', {});
  assert.equal(res.status, 400);
});
