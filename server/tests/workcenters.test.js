const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');

test.after(() => h.stop());

test('POST /api/work-centers creates a centre with defaults', async () => {
  const wc = await h.createWorkCenter();
  const res = await h.get(`/api/work-centers/${wc.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.cost_per_hour, 0);
  assert.equal(res.body.data.capacity_per_hour, 0);
  assert.equal(res.body.data.time_efficiency_pct, 100);
  assert.equal(res.body.data.oee_target_pct, 0);
  assert.equal(res.body.data.status, 'active');
  assert.deepEqual(res.body.data.alternatives, []);
});

test('POST /api/work-centers requires a name and rejects duplicates', async () => {
  const missing = await h.post('/api/work-centers', {});
  assert.equal(missing.status, 400);

  const wc = await h.createWorkCenter();
  const duplicate = await h.post('/api/work-centers', { name: wc.name });
  assert.equal(duplicate.status, 409);
});

test('POST /api/work-centers rejects a duplicate code with 409 rather than 500', async () => {
  const code = `CODE-${h.uid()}`;
  await h.createWorkCenter({ code });
  const res = await h.post('/api/work-centers', { name: `WC ${h.uid()}`, code });
  assert.equal(res.status, 409, `expected a conflict, got ${res.status}: ${res.text}`);
});

test('POST /api/work-centers rejects values outside the schema CHECK constraints', async () => {
  const cases = [
    { cost_per_hour: -1 },
    { capacity_per_hour: -5 },
    { time_efficiency_pct: 150 },
    { time_efficiency_pct: -1 },
    { oee_target_pct: 101 },
    { status: 'archived' }
  ];
  for (const overrides of cases) {
    const res = await h.post('/api/work-centers', { name: `WC ${h.uid()}`, ...overrides });
    assert.equal(
      res.status,
      400,
      `expected 400 for ${JSON.stringify(overrides)}, got ${res.status}: ${res.text}`
    );
  }
});

test('POST /api/work-centers rejects a non-numeric metric', async () => {
  const res = await h.post('/api/work-centers', { name: `WC ${h.uid()}`, cost_per_hour: 'free' });
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${res.text}`);
});

test('GET /api/work-centers filters by status and search', async () => {
  const tag = `tag-${h.uid()}`;
  const wc = await h.createWorkCenter({ tag });

  const bySearch = await h.get('/api/work-centers', { query: { search: tag } });
  assert.equal(bySearch.body.data.length, 1);
  assert.equal(bySearch.body.data[0].id, wc.id);

  const active = await h.get('/api/work-centers', { query: { status: 'active' } });
  assert.ok(active.body.data.every((row) => row.status === 'active'));
});

test('GET /api/work-centers search treats LIKE wildcards as literal text', async () => {
  const unique = `lit${h.uid()}`;
  await h.createWorkCenter({ name: `Exact ${unique}` });

  const res = await h.get('/api/work-centers', { query: { search: '%' } });
  assert.equal(res.body.data.length, 0, 'a bare "%" must not match every work centre');
});

test('GET /api/work-centers/:id returns 404 for an unknown id', async () => {
  const res = await h.get('/api/work-centers/999999');
  assert.equal(res.status, 404);
});

test('PUT /api/work-centers/:id updates fields and validates ranges', async () => {
  const wc = await h.createWorkCenter();

  const ok = await h.put(`/api/work-centers/${wc.id}`, { cost_per_hour: 42.5, tag: 'assembly' });
  assert.equal(ok.status, 200);

  const after = await h.get(`/api/work-centers/${wc.id}`);
  assert.equal(after.body.data.cost_per_hour, 42.5);
  assert.equal(after.body.data.tag, 'assembly');

  const bad = await h.put(`/api/work-centers/${wc.id}`, { time_efficiency_pct: 300 });
  assert.equal(bad.status, 400, `expected 400, got ${bad.status}: ${bad.text}`);

  const unknown = await h.put('/api/work-centers/999999', { tag: 'x' });
  assert.equal(unknown.status, 404);
});

test('PUT /api/work-centers/:id rejects renaming onto an existing name', async () => {
  const a = await h.createWorkCenter();
  const b = await h.createWorkCenter();
  const res = await h.put(`/api/work-centers/${b.id}`, { name: a.name });
  assert.equal(res.status, 409, `expected a conflict, got ${res.status}: ${res.text}`);
});

test('DELETE /api/work-centers/:id deactivates rather than deletes', async () => {
  const wc = await h.createWorkCenter();
  const res = await h.del(`/api/work-centers/${wc.id}`);
  assert.equal(res.status, 200);

  const after = await h.get(`/api/work-centers/${wc.id}`);
  assert.equal(after.status, 200);
  assert.equal(after.body.data.status, 'inactive');

  const unknown = await h.del('/api/work-centers/999999');
  assert.equal(unknown.status, 404);
});

test('alternatives: add, list and remove', async () => {
  const primary = await h.createWorkCenter();
  const alternative = await h.createWorkCenter();

  const added = await h.post(`/api/work-centers/${primary.id}/alternatives`, {
    alternative_work_center_id: alternative.id
  });
  assert.equal(added.status, 201);

  const list = await h.get(`/api/work-centers/${primary.id}/alternatives`);
  assert.equal(list.body.data.length, 1);
  assert.equal(list.body.data[0].alt_id, alternative.id);
  assert.equal(list.body.data[0].alt_name, alternative.name);

  const duplicate = await h.post(`/api/work-centers/${primary.id}/alternatives`, {
    alternative_work_center_id: alternative.id
  });
  assert.equal(duplicate.status, 409);

  const removed = await h.del(`/api/work-centers/${primary.id}/alternatives/${list.body.data[0].id}`);
  assert.equal(removed.status, 200);

  const afterRemoval = await h.get(`/api/work-centers/${primary.id}/alternatives`);
  assert.equal(afterRemoval.body.data.length, 0);
});

test('alternatives: validates the payload and both ids', async () => {
  const primary = await h.createWorkCenter();

  const missing = await h.post(`/api/work-centers/${primary.id}/alternatives`, {});
  assert.equal(missing.status, 400);

  const unknownAlternative = await h.post(`/api/work-centers/${primary.id}/alternatives`, {
    alternative_work_center_id: 999999
  });
  assert.equal(unknownAlternative.status, 404);

  const unknownPrimary = await h.post('/api/work-centers/999999/alternatives', {
    alternative_work_center_id: primary.id
  });
  assert.equal(unknownPrimary.status, 404, 'the parent work centre must exist too');
});

test('alternatives: a work centre cannot be its own alternative', async () => {
  const wc = await h.createWorkCenter();
  const res = await h.post(`/api/work-centers/${wc.id}/alternatives`, {
    alternative_work_center_id: wc.id
  });
  assert.equal(res.status, 400, 'self-referencing alternatives are meaningless');
});

test('alternatives: removing an unknown link returns 404', async () => {
  const wc = await h.createWorkCenter();
  const res = await h.del(`/api/work-centers/${wc.id}/alternatives/999999`);
  assert.equal(res.status, 404);
});
