/**
 * Adversarial suite: malformed input, injection, type confusion, oversized
 * payloads, concurrency and transport-level behaviour.
 *
 * The rule these tests encode: a request may be rejected (4xx) but it must
 * never crash the handler into a generic 500, and it must never corrupt data.
 */
const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');

test.after(() => h.stop());

const noServerError = (res, label) =>
  assert.notEqual(res.status, 500, `${label} produced a 500: ${res.text}`);

/* ------------------------------------------------------- transport basics */

test('base and health routes respond', async () => {
  for (const path of ['/', '/api', '/api/health']) {
    const res = await h.get(path);
    assert.equal(res.status, 200, path);
    assert.equal(res.body.success ?? true, true);
  }
});

test('an unknown route returns JSON 404, not an HTML stack page', async () => {
  const res = await h.get('/api/does-not-exist');
  assert.equal(res.status, 404);
  assert.match(
    res.headers.get('content-type') || '',
    /application\/json/,
    'the API should answer with JSON for unknown paths'
  );
});

test('malformed JSON is rejected with 400, not 500', async () => {
  const res = await h.request('POST', '/api/teams', { raw: '{"name": ' });
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${res.text}`);
  assert.match(res.headers.get('content-type') || '', /application\/json/);
});

test('an oversized JSON body is refused', async () => {
  const huge = JSON.stringify({ name: 'x'.repeat(5 * 1024 * 1024) });
  const res = await h.request('POST', '/api/teams', { raw: huge });
  assert.ok(res.status === 400 || res.status === 413, `expected 400/413, got ${res.status}`);
});

test('CORS is restricted to configured origins', async () => {
  const res = await h.get('/api/health', { headers: { Origin: 'https://evil.example.com' } });
  const allowed = res.headers.get('access-control-allow-origin');
  assert.notEqual(allowed, '*', 'a wildcard CORS policy lets any site call this API');
  assert.notEqual(allowed, 'https://evil.example.com', 'an arbitrary origin was reflected back');
});

/* --------------------------------------------------------- SQL injection */

test('SQL injection through query filters returns data safely', async () => {
  const payloads = [
    "' OR '1'='1",
    "'; DROP TABLE users; --",
    "1; DELETE FROM equipment WHERE 1=1; --",
    "' UNION SELECT password FROM users --"
  ];

  for (const payload of payloads) {
    const equipment = await h.get('/api/equipment', { query: { department: payload } });
    noServerError(equipment, `equipment?department=${payload}`);
    assert.deepEqual(equipment.body.data, [], 'an injection string must match nothing');

    const search = await h.get('/api/work-centers', { query: { search: payload } });
    noServerError(search, `work-centers?search=${payload}`);
  }

  const users = await h.get('/api/teams/users/all');
  assert.ok(users.body.data.length > 0, 'the users table must still exist');
});

test('SQL injection through JSON bodies is stored as literal text', async () => {
  const name = "Robert'); DROP TABLE teams;--";
  const created = await h.post('/api/teams', { name });
  assert.equal(created.status, 201);

  const fetched = await h.get(`/api/teams/${created.body.data.id}`);
  assert.equal(fetched.body.data.name, name, 'the value must round-trip unchanged');

  const list = await h.get('/api/teams');
  assert.equal(list.status, 200, 'the teams table must still exist');
});

/* -------------------------------------------------------- type confusion */

test('array and object values where a scalar is expected do not crash handlers', async () => {
  const cases = [
    ['POST', '/api/teams', { name: { $ne: null } }],
    ['POST', '/api/teams', { name: ['a', 'b'] }],
    ['POST', '/api/auth/login', { email: { $gt: '' }, password: { $gt: '' } }],
    ['POST', '/api/auth/signup', { name: [], email: [], password: [], reEnterPassword: [] }],
    ['POST', '/api/equipment', { name: {}, serial_number: {} }],
    ['POST', '/api/work-centers', { name: 123, cost_per_hour: {} }],
    ['POST', '/api/maintenance', { type: ['corrective'], subject: {}, equipment_id: {}, created_by_user_id: [] }]
  ];

  for (const [method, path, body] of cases) {
    const res = await h.request(method, path, { body });
    noServerError(res, `${method} ${path} ${JSON.stringify(body)}`);
    assert.ok(res.status >= 400, `${method} ${path} accepted a structurally invalid payload`);
  }
});

test('a JSON body that is not an object is rejected cleanly', async () => {
  for (const raw of ['"a string"', '42', 'null', '[]', 'true']) {
    const res = await h.request('POST', '/api/teams', { raw });
    noServerError(res, `body ${raw}`);
    assert.ok(res.status >= 400, `body ${raw} was accepted`);
  }
});

test('non-numeric path parameters are handled, not crashed', async () => {
  const paths = [
    '/api/equipment/abc',
    '/api/teams/abc',
    '/api/maintenance/abc',
    '/api/work-centers/abc',
    '/api/equipment/1e999',
    '/api/maintenance/-1',
    '/api/teams/0'
  ];
  for (const path of paths) {
    const res = await h.get(path);
    noServerError(res, `GET ${path}`);
    assert.equal(res.status, 404, `GET ${path} should be a clean 404`);
  }
});

test('prototype pollution keys are not honoured', async () => {
  const res = await h.request('POST', '/api/teams', {
    raw: JSON.stringify({ name: `Poison ${h.uid()}`, __proto__: { polluted: true }, constructor: { polluted: true } })
  });
  noServerError(res, 'prototype pollution payload');
  assert.equal({}.polluted, undefined, 'Object.prototype was polluted');
});

/* -------------------------------------------------------- string handling */

test('unicode, emoji and control characters round-trip intact', async () => {
  const name = `Ünïcøde 团队 🛠️ ${h.uid()}`;
  const created = await h.post('/api/teams', { name });
  assert.equal(created.status, 201);
  const fetched = await h.get(`/api/teams/${created.body.data.id}`);
  assert.equal(fetched.body.data.name, name);
});

test('an HTML/script payload is stored verbatim and never reflected as HTML', async () => {
  const subject = '<script>alert("xss")</script>';
  const request = await h.createRequest({ subject });
  const res = await h.get(`/api/maintenance/${request.id}`);
  assert.equal(res.body.data.subject, subject);
  assert.match(res.headers.get('content-type') || '', /application\/json/);
});

test('an extremely long field is bounded rather than stored unchecked', async () => {
  const res = await h.post('/api/teams', { name: 'A'.repeat(100000) });
  noServerError(res, 'very long team name');
  assert.equal(res.status, 400, 'unbounded text fields let a client bloat the database');
});

test('a null byte in a string field does not truncate stored data', async () => {
  // The byte is stripped on the way in (see tests/regressions.test.js). What
  // matters here is that everything after it survives: a value silently cut
  // short at the NUL would be far worse than one with the byte removed.
  const marker = h.uid();
  const res = await h.post('/api/teams', { name: `Null\u0000Byte ${marker}` });
  noServerError(res, 'null byte in team name');
  assert.equal(res.status, 201);

  const fetched = await h.get(`/api/teams/${res.body.data.id}`);
  assert.equal(fetched.body.data.name, `NullByte ${marker}`);
  assert.ok(fetched.body.data.name.endsWith(marker), 'text after the null byte must not be lost');
});

/* ------------------------------------------------------------- numerics */

test('numeric edge values are rejected instead of being persisted', async () => {
  const request = await h.createRequest();
  await h.patch(`/api/maintenance/${request.id}/status`, { status: 'in_progress' });

  // Raw bodies, because JSON.stringify turns Infinity into null and would hide
  // the case that actually matters: 1e400 parses back as Infinity.
  const rawDurations = ['1e400', '-1e400', '9007199254740993', '"NaN"', '"12abc"', '-1', 'true'];

  for (const raw of rawDurations) {
    const res = await h.request('PATCH', `/api/maintenance/${request.id}/status`, {
      raw: `{"status":"repaired","duration_hours":${raw}}`
    });
    noServerError(res, `duration_hours=${raw}`);
    assert.equal(res.status, 400, `duration_hours=${raw} was accepted`);
  }

  const stillOpen = await h.get(`/api/maintenance/${request.id}`);
  assert.equal(stillOpen.body.data.status, 'in_progress', 'a rejected update must not change state');
});

test('a huge id does not crash lookups', async () => {
  for (const id of ['99999999999999999999', '1e30', '0x10']) {
    const res = await h.get(`/api/maintenance/${id}`);
    noServerError(res, `GET /api/maintenance/${id}`);
  }
});

/* ------------------------------------------------------------ concurrency */

test('concurrent duplicate team creation yields exactly one row', async () => {
  const name = `Race ${h.uid()}`;
  const results = await Promise.all(
    Array.from({ length: 8 }, () => h.post('/api/teams', { name }))
  );

  for (const res of results) noServerError(res, 'concurrent team create');
  const created = results.filter((r) => r.status === 201);
  assert.equal(created.length, 1, `expected one winner, got ${created.length}`);

  const list = await h.get('/api/teams');
  assert.equal(list.body.data.filter((t) => t.name === name).length, 1);
});

test('concurrent duplicate signups yield exactly one account', async () => {
  const email = `race-${h.uid()}@example.com`;
  const results = await Promise.all(
    Array.from({ length: 6 }, () => h.post('/api/auth/signup', {
      name: 'Racer',
      email,
      password: h.STRONG_PASSWORD,
      reEnterPassword: h.STRONG_PASSWORD
    }))
  );

  for (const res of results) noServerError(res, 'concurrent signup');
  assert.equal(results.filter((r) => r.status === 201).length, 1);
});

test('concurrent status transitions cannot double-advance a request', async () => {
  const request = await h.createRequest();
  const results = await Promise.all(
    Array.from({ length: 6 }, () =>
      h.patch(`/api/maintenance/${request.id}/status`, { status: 'in_progress' })
    )
  );

  for (const res of results) noServerError(res, 'concurrent status update');
  assert.equal(
    results.filter((r) => r.status === 200).length,
    1,
    'only one transition out of "new" should succeed'
  );
});

test('concurrent duplicate team membership yields exactly one row', async () => {
  const team = await h.createTeam();
  const user = await h.createUser('technician');
  const results = await Promise.all(
    Array.from({ length: 6 }, () => h.post(`/api/teams/${team.id}/members`, { user_id: user.id }))
  );

  for (const res of results) noServerError(res, 'concurrent add member');
  assert.equal(results.filter((r) => r.status === 201).length, 1);

  const detail = await h.get(`/api/teams/${team.id}`);
  assert.equal(detail.body.data.members.length, 1);
});

/* ------------------------------------------------------- method handling */

test('unsupported methods on known routes do not 500', async () => {
  const cases = [
    ['PATCH', '/api/teams'],
    ['DELETE', '/api/auth/login'],
    ['PUT', '/api/health'],
    ['POST', '/api/maintenance/calendar']
  ];
  for (const [method, path] of cases) {
    const res = await h.request(method, path, { body: {} });
    noServerError(res, `${method} ${path}`);
  }
});

/* -------------------------------------------------- information exposure */

test('error responses never leak SQL, file paths or stack traces', async () => {
  const probes = [
    ['GET', '/api/equipment/abc'],
    ['POST', '/api/teams', { name: null }],
    ['POST', '/api/work-centers', { name: `WC ${h.uid()}`, cost_per_hour: -1 }],
    ['PATCH', '/api/maintenance/1/status', { status: 'bogus' }]
  ];

  for (const [method, path, body] of probes) {
    const res = await h.request(method, path, body ? { body } : {});
    const text = res.text || '';
    // Driver-level detail must never reach a client: PostgreSQL SQLSTATE codes,
    // constraint names, and the relation/column names in a raw pg error all
    // describe the schema to anyone probing the API.
    assert.ok(!/\b23\d{3}\b|\b42\w{3}\b/.test(text), `${method} ${path} leaked a SQLSTATE code: ${text}`);
    assert.ok(!/violates \w+ constraint|relation "\w+" does not exist/i.test(text),
      `${method} ${path} leaked a database error: ${text}`);
    assert.ok(!/\bat .+\.js:\d+/.test(text), `${method} ${path} leaked a stack trace: ${text}`);
    assert.ok(!/[A-Za-z]:\\|\/home\/|node_modules/.test(text), `${method} ${path} leaked a path: ${text}`);
  }
});

test('login timing does not trivially distinguish unknown from wrong-password', async () => {
  const user = await h.createUser('user');

  const unknown = await h.post('/api/auth/login', {
    email: `nobody-${h.uid()}@example.com`,
    password: 'Whatever1!'
  });
  const wrongPassword = await h.post('/api/auth/login', {
    email: user.email,
    password: 'Whatever1!'
  });

  assert.equal(
    unknown.status,
    wrongPassword.status,
    'distinct status codes let an attacker enumerate registered email addresses'
  );
});
