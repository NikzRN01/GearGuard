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

test('signup: rejects an unknown role', async () => {
  const res = await h.anon.post('/api/auth/signup', {
    name: 'X',
    email: `role-${h.uid()}@example.com`,
    password: h.STRONG_PASSWORD,
    reEnterPassword: h.STRONG_PASSWORD,
    role: 'superadmin'
  });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /user or technician/i);
});

test('SECURITY: public signup cannot mint a privileged account', async () => {
  for (const role of ['manager', 'admin']) {
    const email = `escalate-${h.uid()}@example.com`;
    const res = await h.anon.post('/api/auth/signup', {
      name: 'Escalation attempt',
      email,
      password: h.STRONG_PASSWORD,
      reEnterPassword: h.STRONG_PASSWORD,
      role
    });
    assert.equal(res.status, 400, `signup accepted role "${role}"`);

    const exists = h.db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    assert.equal(exists, undefined, `a ${role} account was created anyway`);
  }
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

// The token alone identifies the account, so there is no email to mismatch.
// The invariant worth pinning is that a token only ever moves its own account.
test('reset-password: a token only resets the account it was issued for', async () => {
  const victim = await h.createUser('technician');
  const holder = await h.createUser('user');

  const forgot = await h.anon.post('/api/auth/forget-password', { email: holder.email });
  const token = forgot.body.resetToken || forgot.body.data?.resetToken;
  assert.ok(token, 'test mail transport should expose the generated token');

  const newPassword = 'Crossed123!';
  const res = await h.anon.post('/api/auth/reset-password', {
    token,
    newPassword,
    confirmPassword: newPassword
  });
  assert.equal(res.status, 200, res.text);

  // The token holder's password moved...
  const holderLogin = await h.anon.post('/api/auth/login', { email: holder.email, password: newPassword });
  assert.equal(holderLogin.status, 200);

  // ...and nobody else's did.
  const victimStillOriginal = await h.anon.post('/api/auth/login', {
    email: victim.email,
    password: victim.password
  });
  assert.equal(victimStillOriginal.status, 200, 'an unrelated account was affected');

  const victimWithNew = await h.anon.post('/api/auth/login', { email: victim.email, password: newPassword });
  assert.notEqual(victimWithNew.status, 200, 'the reset leaked onto another account');
});

test('reset-password: a password change invalidates existing sessions', async () => {
  const account = await h.createUser('technician');
  const agent = h.agentFor(await h.login(account.email, account.password));

  const before = await agent.get('/api/auth/me');
  assert.equal(before.status, 200);

  const forgot = await h.anon.post('/api/auth/forget-password', { email: account.email });
  const token = forgot.body.resetToken;
  const newPassword = 'Rotated456!';
  const reset = await h.anon.post('/api/auth/reset-password', {
    token,
    newPassword,
    confirmPassword: newPassword
  });
  assert.equal(reset.status, 200, reset.text);

  const after = await agent.get('/api/auth/me');
  assert.equal(after.status, 401, 'the old session should not survive a password reset');
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
