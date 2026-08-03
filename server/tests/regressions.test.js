/**
 * Regression suite.
 *
 * Every test here failed against the code as it stood before this round of
 * hardening. They are kept together so the defect each one describes stays
 * legible, rather than being scattered through the feature suites.
 */
const fs = require('fs');
const path = require('path');
const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');

test.after(() => h.stop());

/* ------------------------------------------------------- suite isolation */

test('no suite can run against the default schema', () => {
  // Requiring ../server or ../database builds the connection pool immediately,
  // so a file that imports either before the environment is configured runs
  // against whatever DATABASE_URL points at - in a developer's shell, their own
  // working database. One suite did exactly that under SQLite, filling the
  // checked-out portal.db with test sessions and signup accounts on every run.
  const dir = __dirname;
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.test.js'));
  assert.ok(files.length > 0, 'no suites found to check');

  const offenders = [];
  for (const name of files) {
    const source = fs.readFileSync(path.join(dir, name), 'utf8');

    const appImport = source.search(/require\(['"]\.\.\/(server|database)['"]\)/);
    if (appImport === -1) continue;

    // helpers.js requires testEnv itself, so either import counts - as long as
    // it comes first.
    const envImport = source.search(/require\(['"]\.\/(helpers|testEnv)['"]\)/);
    if (envImport === -1 || envImport > appImport) offenders.push(name);
  }

  assert.deepEqual(offenders, [], `these suites would run against the default schema: ${offenders.join(', ')}`);
});

test('the harness runs in its own schema and cannot send mail', () => {
  assert.ok(process.env.DB_SCHEMA, 'the suite must name its own schema');
  assert.match(
    process.env.DB_SCHEMA,
    /^test_/,
    'a test run must stay inside a test_ schema so it cannot touch real tables'
  );
  assert.ok(process.env.DATABASE_URL, 'the suite must name its own database');
  assert.equal(process.env.MAIL_TRANSPORT, 'json', 'no run may reach a real mailbox');
});

/* --------------------------------------------------------------- transport */

test('a cookie that is not valid percent-encoding is ignored, not a 500', async () => {
  // decodeURIComponent throws URIError on these. The cookie header is
  // attacker-controlled, so that turned any request into a 500 plus a stack
  // trace in the log - an unauthenticated denial of service.
  const hostile = [
    'gg_session=%',
    'gg_session=%E0%A4%A',
    'gg_session=%C3%28',
    '%=x',
    'gg_session=%zz',
    'a=1; gg_session=%; b=2'
  ];

  for (const cookie of hostile) {
    const res = await h.anon.get('/api/maintenance', { headers: { Cookie: cookie } });
    assert.equal(res.status, 401, `cookie ${JSON.stringify(cookie)} should read as "no session", got ${res.status}`);
    assert.equal(res.body.message, 'Authentication required');
  }
});

test('a session still works when an unrelated cookie is malformed', async () => {
  const manager = await h.manager();
  const res = await h.anon.get('/api/maintenance', {
    headers: { Cookie: `junk=%E0; ${manager.session.cookie}; other=%` }
  });
  assert.equal(res.status, 200, 'a broken neighbouring cookie must not invalidate the session');
});

test('a CSRF token with non-ASCII bytes is refused, not a 500', async () => {
  const manager = await h.manager();
  const expected = manager.session.csrfToken;

  // Header values travel as bytes, so only latin1 characters can be sent - and
  // those are exactly the ones that broke the comparison. Decoded as UTF-8 a
  // high byte re-expands to two, timingSafeEqual sees mismatched buffer lengths
  // and throws RangeError, turning a forgery attempt into a 500.
  const forgeries = [
    'é'.repeat(expected.length),
    'ÿ'.repeat(expected.length),
    `${'a'.repeat(expected.length - 1)}ø`
  ];

  for (const forged of forgeries) {
    const res = await h.anon.post('/api/teams', { name: `csrf-${h.uid()}` }, {
      headers: { Cookie: manager.session.cookie, 'X-CSRF-Token': forged }
    });
    assert.equal(res.status, 403, `forged token should be refused, got ${res.status}: ${res.text}`);
    assert.equal(res.body.message, 'Invalid CSRF token');
  }
});

test('a missing or empty CSRF token is refused', async () => {
  const manager = await h.manager();
  for (const headers of [{}, { 'X-CSRF-Token': '' }]) {
    const res = await h.anon.post('/api/teams', { name: `csrf-${h.uid()}` }, {
      headers: { Cookie: manager.session.cookie, ...headers }
    });
    assert.equal(res.status, 403, `expected 403, got ${res.status}`);
  }
});

/* ------------------------------------------------------------------ identity */

test('an email address is the same account whatever its case', async () => {
  const address = `Case-${h.uid()}@Example.COM`;
  const password = h.STRONG_PASSWORD;

  const first = await h.anon.post('/api/auth/signup', {
    name: 'Original', email: address, password, reEnterPassword: password
  });
  assert.equal(first.status, 201);

  // The same address in a different case is the same person, not a new account.
  for (const variant of [address.toLowerCase(), address.toUpperCase()]) {
    const duplicate = await h.anon.post('/api/auth/signup', {
      name: 'Impostor', email: variant, password, reEnterPassword: password
    });
    assert.equal(duplicate.status, 409, `signup with ${variant} should collide, got ${duplicate.status}`);
  }

  const rows = await h.db.get('SELECT COUNT(*) AS count FROM users WHERE LOWER(email) = ?', [address.toLowerCase()]);
  assert.equal(rows.count, 1, 'only one account may exist for an address');
});

test('login accepts the registered address in any case', async () => {
  const address = `Mixed-${h.uid()}@Example.com`;
  await h.anon.post('/api/auth/signup', {
    name: 'Mixed', email: address, password: h.STRONG_PASSWORD, reEnterPassword: h.STRONG_PASSWORD
  });

  for (const variant of [address, address.toLowerCase(), address.toUpperCase()]) {
    const res = await h.anon.post('/api/auth/login', { email: variant, password: h.STRONG_PASSWORD });
    assert.equal(res.status, 200, `login with ${variant} should succeed, got ${res.status}`);
  }
});

test('password recovery finds the account whatever case is typed', async () => {
  const address = `Recover-${h.uid()}@Example.com`;
  await h.anon.post('/api/auth/signup', {
    name: 'Recover', email: address, password: h.STRONG_PASSWORD, reEnterPassword: h.STRONG_PASSWORD
  });

  const res = await h.anon.post('/api/auth/forget-password', { email: address.toUpperCase() });
  assert.equal(res.status, 200);
  assert.ok(res.body.resetToken, 'a token should be issued for the matching account');
});

test('the database refuses two accounts differing only by case', async () => {
  const address = `Direct-${h.uid()}@Example.com`;
  const insert = (name, email) => h.db.run(
    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
    [name, email, 'x', 'user']
  );
  await insert('A', address);
  await assert.rejects(
    () => insert('B', address.toLowerCase()),
    /duplicate key value violates unique constraint/i,
    'the case-insensitive index is the real guarantee, not the route check'
  );
});

/* ------------------------------------------------------------------- stored text */

test('control characters and bidi overrides are stripped from stored text', async () => {
  const cases = [
    ['NUL', `nul\u0000team-${h.uid()}`, 'nulteam-'],
    ['RTL override', `\u202eevil-${h.uid()}`, 'evil-'],
    ['bidi isolate', `\u2066spoof-${h.uid()}`, 'spoof-'],
    ['escape', `esc\u001bteam-${h.uid()}`, 'escteam-']
  ];

  for (const [label, name, expectedPrefix] of cases) {
    const res = await h.post('/api/teams', { name });
    assert.equal(res.status, 201, `${label}: ${res.text}`);
    const row = await h.db.get('SELECT name FROM teams WHERE id = ?', [res.body.data.id]);
    assert.ok(row.name.startsWith(expectedPrefix), `${label}: stored ${JSON.stringify(row.name)}`);
    // eslint-disable-next-line no-control-regex
    assert.doesNotMatch(row.name, /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/, label);
  }
});

test('text made only of stripped characters is a validation error, not a blank row', async () => {
  const res = await h.post('/api/teams', { name: ' \u0000\u202e\u2066 ' });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /blank/i);
});

test('ordinary text survives sanitising untouched', async () => {
  const name = `Métrologie ✓ 中文 ${h.uid()}`;
  const res = await h.post('/api/teams', { name });
  assert.equal(res.status, 201);
  const row = await h.db.get('SELECT name FROM teams WHERE id = ?', [res.body.data.id]);
  assert.equal(row.name, name, 'accents, CJK and symbols are legitimate content');
});

test('a multi-line note keeps its line breaks', async () => {
  const request = await h.createRequest();
  const message = 'first line\nsecond line\ttabbed';
  const res = await h.post(`/api/maintenance/${request.id}/notes`, { message });
  assert.equal(res.status, 201);
  const row = await h.db.get('SELECT message FROM notes WHERE id = ?', [res.body.data.id]);
  assert.equal(row.message, message);
});

/* ------------------------------------------------------------- maintenance */

test('editing a request does not discard the team a manager chose', async () => {
  const equipmentTeam = await h.createTeam();
  const chosenTeam = await h.createTeam();
  const equipment = await h.createEquipment({ maintenance_team_id: equipmentTeam.id });
  const request = await h.createRequest({ equipment_id: equipment.id, team_id: chosenTeam.id });

  const before = await h.db.get('SELECT team_id FROM maintenance_requests WHERE id = ?', [request.id]);
  assert.equal(before.team_id, chosenTeam.id, 'precondition: the manager-chosen team is stored');

  // This is exactly what the manager edit form sends when only the date changes:
  // the unchanged equipment id travels with it.
  const res = await h.put(`/api/maintenance/${request.id}`, {
    type: 'corrective',
    subject: request.subject,
    equipment_id: equipment.id,
    work_center_id: null,
    scheduled_date: '2027-03-04',
    duration_hours: null
  });
  assert.equal(res.status, 200, res.text);

  const after = await h.db.get('SELECT team_id, scheduled_date FROM maintenance_requests WHERE id = ?', [request.id]);
  assert.equal(after.scheduled_date, '2027-03-04', 'the requested change should still apply');
  assert.equal(after.team_id, chosenTeam.id, 'resaving the same equipment must not reset the team');
});

test('pointing a request at different equipment does adopt that team', async () => {
  const teamA = await h.createTeam();
  const teamB = await h.createTeam();
  const equipmentA = await h.createEquipment({ maintenance_team_id: teamA.id });
  const equipmentB = await h.createEquipment({ maintenance_team_id: teamB.id });
  const request = await h.createRequest({ equipment_id: equipmentA.id });

  const res = await h.put(`/api/maintenance/${request.id}`, { equipment_id: equipmentB.id });
  assert.equal(res.status, 200, res.text);

  const after = await h.db.get('SELECT team_id, equipment_id FROM maintenance_requests WHERE id = ?', [request.id]);
  assert.equal(after.equipment_id, equipmentB.id);
  assert.equal(after.team_id, teamB.id, 'a genuine target change should pick up the new default team');
});

test('a request with no team adopts the equipment team on edit', async () => {
  const team = await h.createTeam();
  const bare = await h.createEquipment();
  const request = await h.createRequest({ equipment_id: bare.id });
  await h.db.run('UPDATE maintenance_requests SET team_id = NULL WHERE id = ?', [request.id]);
  await h.db.run('UPDATE equipment SET maintenance_team_id = ? WHERE id = ?', [team.id, bare.id]);

  await h.put(`/api/maintenance/${request.id}`, { equipment_id: bare.id, subject: 'still untargeted' });
  const after = await h.db.get('SELECT team_id FROM maintenance_requests WHERE id = ?', [request.id]);
  assert.equal(after.team_id, team.id, 'filling an empty team from the equipment is still helpful');
});

/* ------------------------------------------------------------------- audit */

const auditActions = async (resourceId) => {
  const rows = await h.db.all(
    "SELECT action FROM audit_log WHERE resource_type = 'maintenance_request' AND resource_id = ? ORDER BY id",
    [String(resourceId)]
  );
  return rows.map((row) => row.action);
};

test('editing a request is recorded in the audit log', async () => {
  const request = await h.createRequest();
  await h.put(`/api/maintenance/${request.id}`, { subject: 'edited subject' });

  const actions = await auditActions(request.id);
  assert.ok(actions.includes('maintenance.update'), `edit was not audited: ${JSON.stringify(actions)}`);
});

test('deleting a request is recorded, including what was removed', async () => {
  const request = await h.createRequest({ subject: 'about to vanish' });
  await h.del(`/api/maintenance/${request.id}`);

  const row = await h.db.get("SELECT action, metadata_json FROM audit_log WHERE action = 'maintenance.delete' AND resource_id = ?", [String(request.id)]);
  assert.ok(row, 'a deletion must leave a trace once the row itself is gone');
  assert.equal(JSON.parse(row.metadata_json).subject, 'about to vanish');
});

test('every audited action the admin console knows about can actually occur', async () => {
  // Guards against the label map and the emitted action names drifting apart.
  const emitted = new Set(
    (await h.db.all('SELECT DISTINCT action FROM audit_log')).map((row) => row.action)
  );
  for (const action of ['auth.login', 'maintenance.create', 'maintenance.update', 'maintenance.delete']) {
    assert.ok(emitted.has(action), `${action} is never written`);
  }
});

/* -------------------------------------------------------------- disclosure */

test('a requester sees team members without their email addresses', async () => {
  const team = await h.createTeam();
  const technician = await h.as('technician');
  await h.post(`/api/teams/${team.id}/members`, { user_id: technician.user.id });

  const requester = await h.as('user');
  const res = await requester.get(`/api/teams/${team.id}`);
  assert.equal(res.status, 200);

  const members = res.body.data.members;
  assert.equal(members.length, 1);
  assert.equal(members[0].name, technician.user.name, 'names are still useful context');
  assert.equal(members[0].email, null, 'the roster must not become a way around the manager-only directory');
});

test('technicians and managers still see member contact details', async () => {
  const team = await h.createTeam();
  const technician = await h.as('technician');
  await h.post(`/api/teams/${team.id}/members`, { user_id: technician.user.id });

  for (const agent of [technician, await h.manager()]) {
    const res = await agent.get(`/api/teams/${team.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.members[0].email, technician.user.email, `${agent.user.role} needs the address book`);
  }
});

test('the operational user directory is restricted to managers and administrators', async () => {
  const requester = await h.as('user');
  const technician = await h.as('technician');
  assert.equal((await requester.get('/api/teams/users/all')).status, 403);
  assert.equal((await technician.get('/api/teams/users/all')).status, 403);
  assert.equal((await (await h.manager()).get('/api/teams/users/all')).status, 200);
  assert.equal((await (await h.as('admin')).get('/api/teams/users/all')).status, 200);
});

/* ------------------------------------------------------------------- roles */

test('an administrator can reach governance and all operational data', async () => {
  const admin = await h.as('admin');
  for (const path of ['/api/maintenance', '/api/equipment', '/api/teams', '/api/work-centers']) {
    const res = await admin.get(path);
    assert.equal(res.status, 200, `${path} should be available to admins, got ${res.status}`);
  }
  assert.equal((await admin.get('/api/admin/overview')).status, 200, 'the admin console must still work');
});
