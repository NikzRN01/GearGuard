/**
 * Production seed safety and the first-administrator bootstrap.
 *
 * database.js does its work at import time, so each scenario needs a process of
 * its own with a different environment. These tests therefore spawn a child
 * node process per case rather than requiring the module directly.
 *
 * What is being defended: seedDemoData creates accounts whose password is
 * committed to this repository, including an administrator. Running it against
 * a real deployment hands anyone who has read the source a working admin login.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const serverDir = path.join(__dirname, '..');

const freshDbPath = () =>
  path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gearguard-boot-')), 'portal.db');

/**
 * Boots database.js in a child process and reports what ended up in `users`.
 *
 * stdout and stderr are merged into `output`: the seed guard and the bootstrap
 * report their decisions through console.warn/error, so the warnings are part
 * of the behaviour under test, not incidental noise.
 */
const boot = (env = {}) => {
  const script = `
    const db = require(${JSON.stringify(path.join(serverDir, 'database.js'))});
    const users = db.prepare('SELECT email, role FROM users ORDER BY email').all();
    process.stdout.write('USERS:' + JSON.stringify(users) + '\\n');
  `;

  const child = spawnSync(process.execPath, ['-e', script], {
    cwd: serverDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      // dotenv must not pull the developer's own .env into these cases.
      DOTENV_CONFIG_PATH: path.join(os.tmpdir(), 'gearguard-nonexistent.env'),
      SQLITE_DB_PATH: freshDbPath(),
      NODE_ENV: '',
      VERCEL: '',
      SEED_DEMO_DATA: '',
      SEED_SHOWCASE_DATA: 'false',
      BOOTSTRAP_ADMIN_EMAIL: '',
      BOOTSTRAP_ADMIN_PASSWORD: '',
      BOOTSTRAP_ADMIN_NAME: '',
      ...env
    }
  });

  const output = `${child.stdout || ''}${child.stderr || ''}`;
  if (child.status !== 0) throw new Error(`boot failed (${child.status}): ${output}`);

  const line = output.split('\n').find((row) => row.startsWith('USERS:'));
  if (!line) throw new Error(`boot produced no user list: ${output}`);
  return { users: JSON.parse(line.slice('USERS:'.length)), output };
};

test('development still seeds the demo accounts', () => {
  const { users } = boot({ NODE_ENV: 'development' });
  const emails = users.map((user) => user.email);
  assert.ok(emails.includes('admin@demo.com'), 'demo admin should exist in development');
  assert.ok(emails.includes('manager@demo.com'));
});

test('NODE_ENV=production creates no demo accounts at all', () => {
  const { users } = boot({ NODE_ENV: 'production' });
  assert.deepEqual(users, [], 'a production boot must not seed published credentials');
});

test('the platform marker alone bars the demo seed, without NODE_ENV', () => {
  // Forgetting NODE_ENV on a deployment is the mistake this guards against.
  const { users } = boot({ NODE_ENV: '', VERCEL: '1' });
  assert.deepEqual(users, []);
});

test('SEED_DEMO_DATA=true cannot re-enable the seed in production', () => {
  const { users } = boot({ NODE_ENV: 'production', SEED_DEMO_DATA: 'true' });
  assert.deepEqual(users, [], 'the production guard must be one-way');
});

test('SEED_DEMO_DATA=false suppresses the seed in development too', () => {
  const { users } = boot({ NODE_ENV: 'development', SEED_DEMO_DATA: 'false' });
  assert.deepEqual(users, []);
});

test('production warns when it has no administrator', () => {
  const { output } = boot({ NODE_ENV: 'production' });
  assert.match(output, /BOOTSTRAP_ADMIN_EMAIL/);
});

test('bootstrap creates the first admin in production', () => {
  const { users } = boot({
    NODE_ENV: 'production',
    BOOTSTRAP_ADMIN_EMAIL: 'ops@example.com',
    BOOTSTRAP_ADMIN_PASSWORD: 'Str0ng!Passw0rd'
  });
  assert.deepEqual(users, [{ email: 'ops@example.com', role: 'admin' }]);
});

test('bootstrap refuses a password that fails the signup policy', () => {
  const { users, output } = boot({
    NODE_ENV: 'production',
    BOOTSTRAP_ADMIN_EMAIL: 'ops@example.com',
    // No uppercase, no special character, too short.
    BOOTSTRAP_ADMIN_PASSWORD: 'weak'
  });
  assert.deepEqual(users, [], 'a weak bootstrap password must not create an account');
  assert.match(output, /Admin bootstrap skipped/);
});

test('bootstrap refuses when only one of the two variables is set', () => {
  const { users, output } = boot({
    NODE_ENV: 'production',
    BOOTSTRAP_ADMIN_EMAIL: 'ops@example.com'
  });
  assert.deepEqual(users, []);
  assert.match(output, /must both be set/);
});

test('bootstrap never logs the password', () => {
  const password = 'Str0ng!Passw0rd';
  const { output } = boot({
    NODE_ENV: 'production',
    BOOTSTRAP_ADMIN_EMAIL: 'ops@example.com',
    BOOTSTRAP_ADMIN_PASSWORD: password
  });
  assert.ok(!output.includes(password), 'the bootstrap password must never reach the logs');
});

test('bootstrap is a no-op once an administrator exists', () => {
  // Development seeds admin@demo.com, so the bootstrap must not add a second.
  const { users } = boot({
    NODE_ENV: 'development',
    BOOTSTRAP_ADMIN_EMAIL: 'ops@example.com',
    BOOTSTRAP_ADMIN_PASSWORD: 'Str0ng!Passw0rd'
  });
  const admins = users.filter((user) => user.role === 'admin');
  assert.equal(admins.length, 1);
  assert.equal(admins[0].email, 'admin@demo.com');
});
