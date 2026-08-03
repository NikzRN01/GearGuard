/**
 * Role-based access control, exercised against the seeded demo accounts.
 *
 * testEnv MUST be required before `../server`: that import builds the
 * connection pool, and without the environment in place this suite would run
 * against whatever DATABASE_URL points at - in a developer's shell, their own
 * working database, which it would fill with sessions, audit rows and signup
 * accounts on every run. A fresh schema gets the same demo seed (seedDemoData
 * in database.js), so the accounts below still exist.
 */
// Must come first: it sets DATABASE_URL and this process's schema before the
// app - and therefore the connection pool - is loaded.
const { teardown } = require('./testEnv');
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.AUTH_LOGIN_RATE_MAX = '100000';
process.env.AUTH_SIGNUP_RATE_MAX = '100000';
process.env.AUTH_RECOVERY_RATE_MAX = '100000';

const app = require('../server');
const db = require('../database');

/** The password seedDemoData gives every demo account. */
const DEMO_PASSWORD = 'Password123!';

let server;
let baseUrl;

test.before(async () => {
  // The demo accounts this suite signs in as are created by seedDemoData during
  // initialization, which is asynchronous now.
  await app.ready;
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}/api`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await teardown(db);
});

async function login(email, role) {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: DEMO_PASSWORD, role })
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return {
    cookie: response.headers.get('set-cookie').split(';')[0],
    csrfToken: body.csrfToken,
    user: body.user
  };
}

test('anonymous resource access is rejected', async () => {
  const response = await fetch(`${baseUrl}/equipment`);
  assert.equal(response.status, 401);
});

test('login creates an HttpOnly session and /me returns server identity', async () => {
  const manager = await login('manager@demo.com', 'manager');
  const response = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: manager.cookie } });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.user.role, 'manager');
  assert.match(manager.cookie, /^gg_session=/);
});

test('preset standard user can authenticate with user access', async () => {
  const user = await login('user@demo.com', 'user');
  assert.equal(user.user.role, 'user');
});

test('state-changing requests require CSRF token', async () => {
  const manager = await login('manager@demo.com', 'manager');
  const response = await fetch(`${baseUrl}/teams`, {
    method: 'POST',
    headers: { Cookie: manager.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Should not be created' })
  });
  assert.equal(response.status, 403);
});

test('administrators can access governance data and all manager operations', async () => {
  const admin = await login('admin@demo.com', 'admin');
  const overviewResponse = await fetch(`${baseUrl}/admin/overview`, { headers: { Cookie: admin.cookie } });
  assert.equal(overviewResponse.status, 200);

  const usersResponse = await fetch(`${baseUrl}/admin/users`, { headers: { Cookie: admin.cookie } });
  assert.equal(usersResponse.status, 200);

  for (const path of ['/maintenance', '/equipment', '/teams', '/teams/users/all', '/work-centers']) {
    const operationsResponse = await fetch(`${baseUrl}${path}`, { headers: { Cookie: admin.cookie } });
    assert.equal(operationsResponse.status, 200, `${path} should be available to administrators`);
  }

  const createTeamResponse = await fetch(`${baseUrl}/teams`, {
    method: 'POST',
    headers: { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrfToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Admin operations ${Date.now()}` })
  });
  assert.equal(createTeamResponse.status, 201);

  const selfRoleResponse = await fetch(`${baseUrl}/admin/users/${admin.user.id}/role`, {
    method: 'PATCH',
    headers: { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrfToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'manager' })
  });
  assert.equal(selfRoleResponse.status, 403);
});

test('technicians cannot enumerate users or create teams', async () => {
  const technician = await login('tech1@demo.com', 'technician');
  const usersResponse = await fetch(`${baseUrl}/teams/users/all`, { headers: { Cookie: technician.cookie } });
  assert.equal(usersResponse.status, 403);

  const createResponse = await fetch(`${baseUrl}/teams`, {
    method: 'POST',
    headers: { Cookie: technician.cookie, 'X-CSRF-Token': technician.csrfToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Unauthorized team' })
  });
  assert.equal(createResponse.status, 403);

  const equipmentMutation = await fetch(`${baseUrl}/equipment`, {
    method: 'POST',
    headers: { Cookie: technician.cookie, 'X-CSRF-Token': technician.csrfToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(equipmentMutation.status, 403);

  const workCenterMutation = await fetch(`${baseUrl}/work-centers`, {
    method: 'POST',
    headers: { Cookie: technician.cookie, 'X-CSRF-Token': technician.csrfToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(workCenterMutation.status, 403);
});

test('technician request listing is scoped by authenticated identity', async () => {
  const technician = await login('tech1@demo.com', 'technician');
  const response = await fetch(`${baseUrl}/maintenance`, { headers: { Cookie: technician.cookie } });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.ok(body.data.every((request) => Number(request.assigned_to_user_id) === Number(technician.user.id)));
});

test('request identity comes from session and cross-technician access is denied', async () => {
  const manager = await login('manager@demo.com', 'manager');
  const tech1 = await login('tech1@demo.com', 'technician');
  const tech2 = await login('tech2@demo.com', 'technician');
  const equipmentResponse = await fetch(`${baseUrl}/equipment`, { headers: { Cookie: manager.cookie } });
  const equipment = (await equipmentResponse.json()).data[0];

  const createResponse = await fetch(`${baseUrl}/maintenance`, {
    method: 'POST',
    headers: { Cookie: manager.cookie, 'X-CSRF-Token': manager.csrfToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'corrective', subject: 'RBAC ownership test', equipment_id: equipment.id, created_by_user_id: tech1.user.id })
  });
  const created = await createResponse.json();
  assert.equal(createResponse.status, 201, JSON.stringify(created));
  const requestId = created.data.id;

  try {
    const assignResponse = await fetch(`${baseUrl}/maintenance/${requestId}/assign`, {
      method: 'PATCH',
      headers: { Cookie: manager.cookie, 'X-CSRF-Token': manager.csrfToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: tech2.user.id })
    });
    assert.equal(assignResponse.status, 200);

    const managerRead = await fetch(`${baseUrl}/maintenance/${requestId}`, { headers: { Cookie: manager.cookie } });
    const managerBody = await managerRead.json();
    assert.equal(Number(managerBody.data.created_by_user_id), Number(manager.user.id));

    const forbiddenRead = await fetch(`${baseUrl}/maintenance/${requestId}`, { headers: { Cookie: tech1.cookie } });
    assert.equal(forbiddenRead.status, 403);

    const forbiddenStatus = await fetch(`${baseUrl}/maintenance/${requestId}/status`, {
      method: 'PATCH',
      headers: { Cookie: tech1.cookie, 'X-CSRF-Token': tech1.csrfToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' })
    });
    assert.equal(forbiddenStatus.status, 403);
  } finally {
    await fetch(`${baseUrl}/maintenance/${requestId}`, {
      method: 'DELETE',
      headers: { Cookie: manager.cookie, 'X-CSRF-Token': manager.csrfToken }
    });
  }
});

test('public signup cannot create privileged roles', async () => {
  const response = await fetch(`${baseUrl}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Privilege Escalation',
      email: `rbac-${Date.now()}@example.com`,
      password: 'Password123!',
      reEnterPassword: 'Password123!',
      role: 'admin'
    })
  });
  assert.equal(response.status, 400);
});

test('logout revokes the server session', async () => {
  const manager = await login('manager@demo.com', 'manager');
  const logoutResponse = await fetch(`${baseUrl}/auth/logout`, {
    method: 'POST',
    headers: { Cookie: manager.cookie, 'X-CSRF-Token': manager.csrfToken }
  });
  assert.equal(logoutResponse.status, 200);
  const meResponse = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: manager.cookie } });
  assert.equal(meResponse.status, 401);
});
