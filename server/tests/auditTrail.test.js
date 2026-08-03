/**
 * Audit coverage for the operational tables, and the read path that makes it
 * usable.
 *
 * Maintenance requests and authentication were already audited; equipment,
 * teams and work centres were not audited at all, so thirteen mutating
 * endpoints changed records with no trace of who did it. The read side matters
 * just as much: the trail used to be a hard LIMIT 50 with no paging, which made
 * anything older than the last fifty events unreachable.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  as,
  post,
  put,
  patch,
  del,
  stop,
  uid,
  createTeam,
  createEquipment,
  createWorkCenter,
  createRequest,
  createUser
} = require('./helpers');

test.after(stop);

let adminAgent;
const admin = async () => {
  if (!adminAgent) adminAgent = await as('admin');
  return adminAgent;
};

/** Audit entries for one resource, newest first. */
const entriesFor = async (resourceType, resourceId) => {
  const agent = await admin();
  const response = await agent.get('/api/admin/audit', {
    query: { resource_type: resourceType, limit: '200' }
  });
  assert.equal(response.status, 200, response.text);
  return response.body.data.filter((event) => String(event.resource_id) === String(resourceId));
};

const actionsFor = async (resourceType, resourceId) =>
  (await entriesFor(resourceType, resourceId)).map((event) => event.action);

test('equipment creation, update and deletion are audited', async () => {
  const equipment = await createEquipment({ name: `Press ${uid()}`, location: 'Bay 1' });

  assert.deepEqual(await actionsFor('equipment', equipment.id), ['equipment.create']);

  const updated = await put(`/api/equipment/${equipment.id}`, { location: 'Bay 7' });
  assert.equal(updated.status, 200, updated.text);
  assert.ok((await actionsFor('equipment', equipment.id)).includes('equipment.update'));

  const removed = await del(`/api/equipment/${equipment.id}`);
  assert.equal(removed.status, 200, removed.text);
  assert.ok((await actionsFor('equipment', equipment.id)).includes('equipment.delete'));
});

test('an equipment update records what each field held before', async () => {
  const equipment = await createEquipment({ location: 'Bay 1' });
  await put(`/api/equipment/${equipment.id}`, { location: 'Bay 7' });

  const update = (await entriesFor('equipment', equipment.id))
    .find((event) => event.action === 'equipment.update');
  assert.ok(update, 'expected an equipment.update entry');
  assert.deepEqual(update.metadata.changes.location, { from: 'Bay 1', to: 'Bay 7' });
});

test('an update that changes nothing writes no audit entry', async () => {
  const equipment = await createEquipment({ location: 'Bay 1' });
  // The edit form resends every field on save; unchanged saves must not
  // accumulate empty entries that bury the real ones.
  const response = await put(`/api/equipment/${equipment.id}`, { location: 'Bay 1' });
  assert.equal(response.status, 200, response.text);

  const actions = await actionsFor('equipment', equipment.id);
  assert.deepEqual(actions, ['equipment.create']);
});

test('an audited entry names the actor who made the change', async () => {
  const equipment = await createEquipment();
  const [entry] = await entriesFor('equipment', equipment.id);
  assert.equal(entry.action, 'equipment.create');
  assert.ok(entry.actor_name, 'the trail must attribute the change to somebody');
  assert.ok(entry.actor_email);
});

test('team lifecycle and membership changes are audited', async () => {
  const team = await createTeam(`Team ${uid()}`);
  const technician = await createUser('technician');

  const renamed = await put(`/api/teams/${team.id}`, { name: `Renamed ${uid()}` });
  assert.equal(renamed.status, 200, renamed.text);

  const added = await post(`/api/teams/${team.id}/members`, { user_id: technician.id });
  assert.equal(added.status, 201, added.text);

  const removedMember = await del(`/api/teams/${team.id}/members/${technician.id}`);
  assert.equal(removedMember.status, 200, removedMember.text);

  const deleted = await del(`/api/teams/${team.id}`);
  assert.equal(deleted.status, 200, deleted.text);

  const actions = await actionsFor('team', team.id);
  for (const action of ['team.create', 'team.update', 'team.member.add', 'team.member.remove', 'team.delete']) {
    assert.ok(actions.includes(action), `expected ${action} in ${JSON.stringify(actions)}`);
  }
});

test('team membership entries record which user joined or left', async () => {
  const team = await createTeam(`Team ${uid()}`);
  const technician = await createUser('technician');
  await post(`/api/teams/${team.id}/members`, { user_id: technician.id });

  const added = (await entriesFor('team', team.id)).find((event) => event.action === 'team.member.add');
  assert.equal(added.metadata.user_id, technician.id);
  assert.equal(added.metadata.role, 'technician');
});

test('work centre changes and alternative links are audited', async () => {
  const centre = await createWorkCenter({ cost_per_hour: 100 });
  const alternative = await createWorkCenter();

  const updated = await put(`/api/work-centers/${centre.id}`, { cost_per_hour: 250 });
  assert.equal(updated.status, 200, updated.text);

  const linked = await post(`/api/work-centers/${centre.id}/alternatives`, {
    alternative_work_center_id: alternative.id
  });
  assert.equal(linked.status, 201, linked.text);

  const unlinked = await del(`/api/work-centers/${centre.id}/alternatives/${linked.body.data.id}`);
  assert.equal(unlinked.status, 200, unlinked.text);

  const deactivated = await del(`/api/work-centers/${centre.id}`);
  assert.equal(deactivated.status, 200, deactivated.text);

  const actions = await actionsFor('work_center', centre.id);
  for (const action of [
    'workcenter.create',
    'workcenter.update',
    'workcenter.alternative.add',
    'workcenter.alternative.remove',
    'workcenter.deactivate'
  ]) {
    assert.ok(actions.includes(action), `expected ${action} in ${JSON.stringify(actions)}`);
  }
});

test('a work centre cost change records the old and new figure', async () => {
  const centre = await createWorkCenter({ cost_per_hour: 100 });
  await put(`/api/work-centers/${centre.id}`, { cost_per_hour: 250 });

  const update = (await entriesFor('work_center', centre.id))
    .find((event) => event.action === 'workcenter.update');
  assert.deepEqual(update.metadata.changes.cost_per_hour, { from: 100, to: 250 });
});

test('the audit read path pages rather than truncating at fifty', async () => {
  const agent = await admin();

  const firstPage = await agent.get('/api/admin/audit', { query: { limit: '5' } });
  assert.equal(firstPage.status, 200, firstPage.text);
  assert.equal(firstPage.body.data.length, 5);
  assert.ok(firstPage.body.pagination.total > 5, 'these suites generate more than five events');
  assert.equal(firstPage.body.pagination.offset, 0);
  assert.equal(firstPage.body.pagination.hasMore, true);

  const secondPage = await agent.get('/api/admin/audit', { query: { limit: '5', offset: '5' } });
  assert.equal(secondPage.status, 200);
  const firstIds = firstPage.body.data.map((event) => event.id);
  const secondIds = secondPage.body.data.map((event) => event.id);
  assert.equal(firstIds.some((id) => secondIds.includes(id)), false, 'pages must not overlap');
});

test('the audit page size is capped so one request cannot pull the whole log', async () => {
  const agent = await admin();
  const response = await agent.get('/api/admin/audit', { query: { limit: '100000' } });
  assert.equal(response.status, 200);
  assert.ok(response.body.pagination.limit <= 200);
});

test('a nonsense limit or offset falls back to the defaults', async () => {
  const agent = await admin();
  const response = await agent.get('/api/admin/audit', { query: { limit: 'abc', offset: '-9' } });
  assert.equal(response.status, 200);
  assert.equal(response.body.pagination.limit, 50);
  assert.equal(response.body.pagination.offset, 0);
});

test('the audit trail can be filtered by action', async () => {
  const agent = await admin();
  const response = await agent.get('/api/admin/audit', { query: { action: 'equipment.create', limit: '200' } });
  assert.equal(response.status, 200);
  assert.ok(response.body.data.length > 0);
  assert.ok(response.body.data.every((event) => event.action === 'equipment.create'));
});

test('only an administrator can read the audit trail', async () => {
  const manager = await as('manager');
  const response = await manager.get('/api/admin/audit');
  assert.equal(response.status, 403);
});

test('a note records its author and returns the name', async () => {
  const request = await createRequest();
  const technician = await as('technician');

  const created = await post(`/api/maintenance/${request.id}/notes`, { message: 'Lockout applied.' });
  assert.equal(created.status, 201, created.text);

  const detail = await (await admin()).get(`/api/maintenance/${request.id}`);
  assert.equal(detail.status, 200, detail.text);
  const [note] = detail.body.data.notes;
  assert.equal(note.message, 'Lockout applied.');
  assert.ok(note.created_by_user_id, 'the note must record who wrote it');
  assert.ok(note.created_by_name, 'the note must expose the author name for display');
  // Unused beyond proving a second role exists; assignment rules are covered
  // by the maintenance suite.
  assert.ok(technician.user);
});

test('authorship comes from the session, not the request body', async () => {
  const request = await createRequest();
  const impostor = await createUser('manager');

  const created = await post(`/api/maintenance/${request.id}/notes`, {
    message: 'Attributed to somebody else?',
    created_by_user_id: impostor.id
  });
  assert.equal(created.status, 201, created.text);

  const detail = await (await admin()).get(`/api/maintenance/${request.id}`);
  const note = detail.body.data.notes.find((row) => row.message === 'Attributed to somebody else?');
  assert.notEqual(note.created_by_user_id, impostor.id, 'the body must not decide authorship');
});

test('note creation is still audited alongside authorship', async () => {
  const request = await createRequest();
  await post(`/api/maintenance/${request.id}/notes`, { message: 'Recorded.' });

  const actions = await actionsFor('maintenance_request', request.id);
  assert.ok(actions.includes('maintenance.note.create'));
});

test('a status change is audited with its transition', async () => {
  const request = await createRequest();
  const response = await patch(`/api/maintenance/${request.id}/status`, { status: 'in_progress' });
  assert.equal(response.status, 200, response.text);

  const entry = (await entriesFor('maintenance_request', request.id))
    .find((event) => event.action === 'maintenance.status');
  assert.deepEqual(entry.metadata, { from: 'new', to: 'in_progress' });
});
