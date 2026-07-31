const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');

test.after(() => h.stop());

/* ------------------------------------------------------------------ create */

test('POST /api/maintenance creates a corrective request against equipment', async () => {
  const user = await h.createUser('manager');
  const equipment = await h.createEquipment();
  const res = await h.post('/api/maintenance', {
    type: 'corrective',
    subject: 'Printer jammed',
    equipment_id: equipment.id,
    created_by_user_id: user.id
  });
  assert.equal(res.status, 201);
  assert.ok(Number.isInteger(res.body.data.id));

  const detail = await h.get(`/api/maintenance/${res.body.data.id}`);
  assert.equal(detail.body.data.status, 'new');
  assert.equal(detail.body.data.equipment_id, equipment.id);
  assert.equal(detail.body.data.equipment_name, equipment.name);
});

test('POST /api/maintenance auto-fills the team from the equipment', async () => {
  const user = await h.createUser('manager');
  const team = await h.createTeam();
  const equipment = await h.createEquipment({ maintenance_team_id: team.id });

  const res = await h.post('/api/maintenance', {
    type: 'corrective',
    subject: 'Auto team',
    equipment_id: equipment.id,
    created_by_user_id: user.id
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.team_id, team.id);
});

test('POST /api/maintenance creates a work-center request', async () => {
  const user = await h.createUser('manager');
  const wc = await h.createWorkCenter();
  const res = await h.post('/api/maintenance', {
    type: 'corrective',
    subject: 'Line down',
    work_center_id: wc.id,
    created_by_user_id: user.id
  });
  assert.equal(res.status, 201);

  const detail = await h.get(`/api/maintenance/${res.body.data.id}`);
  assert.equal(detail.body.data.work_center_id, wc.id);
  assert.equal(detail.body.data.equipment_id, null);
  assert.equal(detail.body.data.work_center_name, wc.name);
});

test('POST /api/maintenance requires exactly one target', async () => {
  const user = await h.createUser('manager');
  const equipment = await h.createEquipment();
  const wc = await h.createWorkCenter();

  const neither = await h.post('/api/maintenance', {
    type: 'corrective', subject: 'X', created_by_user_id: user.id
  });
  assert.equal(neither.status, 400);

  const both = await h.post('/api/maintenance', {
    type: 'corrective',
    subject: 'X',
    equipment_id: equipment.id,
    work_center_id: wc.id,
    created_by_user_id: user.id
  });
  assert.equal(both.status, 400);
});

test('POST /api/maintenance rejects an invalid type', async () => {
  const user = await h.createUser('manager');
  const equipment = await h.createEquipment();
  const res = await h.post('/api/maintenance', {
    type: 'emergency',
    subject: 'X',
    equipment_id: equipment.id,
    created_by_user_id: user.id
  });
  assert.equal(res.status, 400);
});

test('POST /api/maintenance requires a scheduled date for preventive work', async () => {
  const user = await h.createUser('manager');
  const equipment = await h.createEquipment();
  const res = await h.post('/api/maintenance', {
    type: 'preventive',
    subject: 'Quarterly service',
    equipment_id: equipment.id,
    created_by_user_id: user.id
  });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /scheduled date/i);
});

test('POST /api/maintenance rejects unknown equipment, work centre and creator', async () => {
  const user = await h.createUser('manager');
  const equipment = await h.createEquipment();

  const badEquipment = await h.post('/api/maintenance', {
    type: 'corrective', subject: 'X', equipment_id: 999999, created_by_user_id: user.id
  });
  assert.equal(badEquipment.status, 404);

  const badWorkCenter = await h.post('/api/maintenance', {
    type: 'corrective', subject: 'X', work_center_id: 999999, created_by_user_id: user.id
  });
  assert.equal(badWorkCenter.status, 404);

  const badUser = await h.post('/api/maintenance', {
    type: 'corrective', subject: 'X', equipment_id: equipment.id, created_by_user_id: 999999
  });
  assert.equal(badUser.status, 404);
});

test('POST /api/maintenance rejects an unknown team_id instead of storing a dangling reference', async () => {
  const user = await h.createUser('manager');
  const equipment = await h.createEquipment();
  const res = await h.post('/api/maintenance', {
    type: 'corrective',
    subject: 'Dangling team',
    equipment_id: equipment.id,
    team_id: 999999,
    created_by_user_id: user.id
  });
  assert.equal(res.status, 404, 'a request must not reference a team that does not exist');
});

test('POST /api/maintenance rejects a blank subject', async () => {
  const user = await h.createUser('manager');
  const equipment = await h.createEquipment();
  const res = await h.post('/api/maintenance', {
    type: 'corrective',
    subject: '   ',
    equipment_id: equipment.id,
    created_by_user_id: user.id
  });
  assert.equal(res.status, 400, 'a whitespace-only subject must not be accepted');
});

test('POST /api/maintenance rejects a malformed scheduled date', async () => {
  const user = await h.createUser('manager');
  const equipment = await h.createEquipment();
  const res = await h.post('/api/maintenance', {
    type: 'preventive',
    subject: 'Bad date',
    equipment_id: equipment.id,
    scheduled_date: 'next tuesday',
    created_by_user_id: user.id
  });
  assert.equal(res.status, 400, 'an unparseable scheduled_date must be rejected');
});

/* -------------------------------------------------------------------- read */

test('GET /api/maintenance filters by status, type, team, assignee and date', async () => {
  const manager = await h.createUser('manager');
  const team = await h.createTeam();
  const equipment = await h.createEquipment({ maintenance_team_id: team.id });

  const scheduled = await h.post('/api/maintenance', {
    type: 'preventive',
    subject: 'Filterable preventive',
    equipment_id: equipment.id,
    scheduled_date: '2030-05-05',
    created_by_user_id: manager.id
  });
  assert.equal(scheduled.status, 201);
  await h.patch(`/api/maintenance/${scheduled.body.data.id}/assign`, { user_id: manager.id });

  const byType = await h.get('/api/maintenance', { query: { type: 'preventive' } });
  assert.ok(byType.body.data.every((r) => r.type === 'preventive'));

  const byStatus = await h.get('/api/maintenance', { query: { status: 'new' } });
  assert.ok(byStatus.body.data.every((r) => r.status === 'new'));

  const byTeam = await h.get('/api/maintenance', { query: { team_id: team.id } });
  assert.ok(byTeam.body.data.length >= 1);
  assert.ok(byTeam.body.data.every((r) => r.team_id === team.id));

  const byAssignee = await h.get('/api/maintenance', { query: { assigned_to: manager.id } });
  assert.ok(byAssignee.body.data.some((r) => r.id === scheduled.body.data.id));

  const byDate = await h.get('/api/maintenance', { query: { scheduled_date: '2030-05-05' } });
  assert.ok(byDate.body.data.some((r) => r.id === scheduled.body.data.id));
});

test('GET /api/maintenance/calendar honours the date range', async () => {
  const manager = await h.createUser('manager');
  const equipment = await h.createEquipment();
  await h.post('/api/maintenance', {
    type: 'preventive',
    subject: 'In range',
    equipment_id: equipment.id,
    scheduled_date: '2031-03-15',
    created_by_user_id: manager.id
  });
  await h.post('/api/maintenance', {
    type: 'preventive',
    subject: 'Out of range',
    equipment_id: equipment.id,
    scheduled_date: '2031-09-15',
    created_by_user_id: manager.id
  });

  const res = await h.get('/api/maintenance/calendar', {
    query: { start_date: '2031-03-01', end_date: '2031-03-31' }
  });
  assert.equal(res.status, 200);
  const subjects = res.body.data.map((r) => r.subject);
  assert.ok(subjects.includes('In range'));
  assert.ok(!subjects.includes('Out of range'));
  assert.ok(res.body.data.every((r) => r.scheduled_date), 'calendar must only return scheduled work');
});

test('GET /api/maintenance/calendar is not shadowed by the :id route', async () => {
  const res = await h.get('/api/maintenance/calendar');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
});

test('GET /api/maintenance/:id includes notes and returns 404 when unknown', async () => {
  const request = await h.createRequest();
  await h.post(`/api/maintenance/${request.id}/notes`, { message: 'First note' });

  const res = await h.get(`/api/maintenance/${request.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.notes.length, 1);
  assert.equal(res.body.data.notes[0].message, 'First note');

  const missing = await h.get('/api/maintenance/999999');
  assert.equal(missing.status, 404);
});

/* ------------------------------------------------------------------ assign */

test('PATCH /:id/assign assigns an eligible technician', async () => {
  const team = await h.createTeam();
  const technician = await h.createUser('technician');
  await h.post(`/api/teams/${team.id}/members`, { user_id: technician.id });
  const equipment = await h.createEquipment({ maintenance_team_id: team.id });
  const request = await h.createRequest({ equipment_id: equipment.id });

  const res = await h.patch(`/api/maintenance/${request.id}/assign`, { user_id: technician.id });
  assert.equal(res.status, 200);

  const detail = await h.get(`/api/maintenance/${request.id}`);
  assert.equal(detail.body.data.assigned_to_user_id, technician.id);
  assert.equal(detail.body.data.assigned_to_name, technician.name);
});

test('PATCH /:id/assign rejects plain users and unknown ids', async () => {
  const request = await h.createRequest();
  const plainUser = await h.createUser('user');

  const missing = await h.patch(`/api/maintenance/${request.id}/assign`, {});
  assert.equal(missing.status, 400);

  const unknownRequest = await h.patch('/api/maintenance/999999/assign', { user_id: plainUser.id });
  assert.equal(unknownRequest.status, 404);

  const unknownUser = await h.patch(`/api/maintenance/${request.id}/assign`, { user_id: 999999 });
  assert.equal(unknownUser.status, 404);

  const wrongRole = await h.patch(`/api/maintenance/${request.id}/assign`, { user_id: plainUser.id });
  assert.equal(wrongRole.status, 403);
});

test('PATCH /:id/assign blocks a technician outside the assigned team', async () => {
  const team = await h.createTeam();
  const outsider = await h.createUser('technician');
  const equipment = await h.createEquipment({ maintenance_team_id: team.id });
  const request = await h.createRequest({ equipment_id: equipment.id });

  const res = await h.patch(`/api/maintenance/${request.id}/assign`, { user_id: outsider.id });
  assert.equal(res.status, 403);
});

test('PATCH /:id/assign allows any manager regardless of team', async () => {
  const team = await h.createTeam();
  const manager = await h.createUser('manager');
  const equipment = await h.createEquipment({ maintenance_team_id: team.id });
  const request = await h.createRequest({ equipment_id: equipment.id });

  const res = await h.patch(`/api/maintenance/${request.id}/assign`, { user_id: manager.id });
  assert.equal(res.status, 200);
});

test('PATCH /:id/assign refuses to reassign a closed request', async () => {
  const manager = await h.createUser('manager');
  const request = await h.createRequest();
  await h.patch(`/api/maintenance/${request.id}/status`, { status: 'scrap' });

  const res = await h.patch(`/api/maintenance/${request.id}/assign`, { user_id: manager.id });
  assert.notEqual(res.status, 200, 'a repaired/scrapped request must not accept a new assignee');
});

/* ------------------------------------------------------------------ status */

test('PATCH /:id/status walks the documented workflow', async () => {
  const request = await h.createRequest();

  const start = await h.patch(`/api/maintenance/${request.id}/status`, { status: 'in_progress' });
  assert.equal(start.status, 200);

  const finish = await h.patch(`/api/maintenance/${request.id}/status`, {
    status: 'repaired',
    duration_hours: 2.5
  });
  assert.equal(finish.status, 200);

  const detail = await h.get(`/api/maintenance/${request.id}`);
  assert.equal(detail.body.data.status, 'repaired');
  assert.equal(detail.body.data.duration_hours, 2.5);
});

test('PATCH /:id/status accepts a transition without duration_hours', async () => {
  const request = await h.createRequest();
  const res = await h.patch(`/api/maintenance/${request.id}/status`, { status: 'in_progress' });
  assert.equal(res.status, 200, `omitting duration_hours must not fail: ${res.text}`);
});

test('PATCH /:id/status rejects illegal transitions and unknown statuses', async () => {
  const request = await h.createRequest();

  const skipAhead = await h.patch(`/api/maintenance/${request.id}/status`, { status: 'repaired' });
  assert.equal(skipAhead.status, 400);

  const bogus = await h.patch(`/api/maintenance/${request.id}/status`, { status: 'exploded' });
  assert.equal(bogus.status, 400);

  const missing = await h.patch(`/api/maintenance/${request.id}/status`, {});
  assert.equal(missing.status, 400);

  await h.patch(`/api/maintenance/${request.id}/status`, { status: 'in_progress' });
  await h.patch(`/api/maintenance/${request.id}/status`, { status: 'repaired' });
  const reopen = await h.patch(`/api/maintenance/${request.id}/status`, { status: 'in_progress' });
  assert.equal(reopen.status, 400, 'a terminal status must be final');
});

test('PATCH /:id/status rejects a negative or non-numeric duration', async () => {
  const request = await h.createRequest();
  await h.patch(`/api/maintenance/${request.id}/status`, { status: 'in_progress' });

  const negative = await h.patch(`/api/maintenance/${request.id}/status`, {
    status: 'repaired',
    duration_hours: -5
  });
  assert.equal(negative.status, 400, 'negative work duration is not meaningful');
});

test('PATCH /:id/status returns 404 for an unknown request', async () => {
  const res = await h.patch('/api/maintenance/999999/status', { status: 'in_progress' });
  assert.equal(res.status, 404);
});

/* ------------------------------------------------------------------- notes */

test('POST /:id/notes stores a note and validates input', async () => {
  const request = await h.createRequest();

  const created = await h.post(`/api/maintenance/${request.id}/notes`, { message: 'Ordered a part' });
  assert.equal(created.status, 201);

  const missing = await h.post(`/api/maintenance/${request.id}/notes`, {});
  assert.equal(missing.status, 400);

  const blank = await h.post(`/api/maintenance/${request.id}/notes`, { message: '   ' });
  assert.equal(blank.status, 400, 'a whitespace-only note must not be accepted');

  const unknown = await h.post('/api/maintenance/999999/notes', { message: 'X' });
  assert.equal(unknown.status, 404);
});

/* ------------------------------------------------------------------ update */

test('PUT /api/maintenance/:id updates the schedule without dropping the target', async () => {
  const equipment = await h.createEquipment();
  const request = await h.createRequest({ equipment_id: equipment.id });

  const res = await h.put(`/api/maintenance/${request.id}`, { scheduled_date: '2032-01-20' });
  assert.equal(res.status, 200, res.text);

  const detail = await h.get(`/api/maintenance/${request.id}`);
  assert.equal(String(detail.body.data.scheduled_date).slice(0, 10), '2032-01-20');
  assert.equal(
    detail.body.data.equipment_id,
    equipment.id,
    'a partial update must not detach the request from its equipment'
  );
});

test('PUT /api/maintenance/:id switches the target between equipment and work centre', async () => {
  const equipment = await h.createEquipment();
  const wc = await h.createWorkCenter();
  const request = await h.createRequest({ equipment_id: equipment.id });

  const res = await h.put(`/api/maintenance/${request.id}`, { work_center_id: wc.id });
  assert.equal(res.status, 200);

  const detail = await h.get(`/api/maintenance/${request.id}`);
  assert.equal(detail.body.data.work_center_id, wc.id);
  assert.equal(detail.body.data.equipment_id, null);
});

test('PUT /api/maintenance/:id refuses to edit a completed request', async () => {
  const request = await h.createRequest();
  await h.patch(`/api/maintenance/${request.id}/status`, { status: 'in_progress' });
  await h.patch(`/api/maintenance/${request.id}/status`, { status: 'repaired' });

  const res = await h.put(`/api/maintenance/${request.id}`, { subject: 'Too late' });
  assert.equal(res.status, 400);
});

test('PUT /api/maintenance/:id validates ids and type', async () => {
  const request = await h.createRequest();

  const unknown = await h.put('/api/maintenance/999999', { subject: 'X' });
  assert.equal(unknown.status, 404);

  const badType = await h.put(`/api/maintenance/${request.id}`, { type: 'urgent' });
  assert.equal(badType.status, 400);

  const badEquipment = await h.put(`/api/maintenance/${request.id}`, { equipment_id: 999999 });
  assert.equal(badEquipment.status, 404);

  const badWorkCenter = await h.put(`/api/maintenance/${request.id}`, { work_center_id: 999999 });
  assert.equal(badWorkCenter.status, 404);
});

test('PUT /api/maintenance/:id keeps preventive work scheduled', async () => {
  const manager = await h.createUser('manager');
  const equipment = await h.createEquipment();
  const created = await h.post('/api/maintenance', {
    type: 'preventive',
    subject: 'Scheduled service',
    equipment_id: equipment.id,
    scheduled_date: '2033-06-01',
    created_by_user_id: manager.id
  });

  const res = await h.put(`/api/maintenance/${created.body.data.id}`, { scheduled_date: null });
  assert.equal(res.status, 400, 'preventive work cannot be left without a scheduled date');
});

/* ------------------------------------------------------------------ delete */

test('DELETE /api/maintenance/:id removes the request and its notes', async () => {
  const request = await h.createRequest();
  await h.post(`/api/maintenance/${request.id}/notes`, { message: 'to be removed' });

  const res = await h.del(`/api/maintenance/${request.id}`);
  assert.equal(res.status, 200);

  const after = await h.get(`/api/maintenance/${request.id}`);
  assert.equal(after.status, 404);

  const Database = require('better-sqlite3');
  const db = new Database(h.dbFile, { readonly: true });
  const orphans = db.prepare('SELECT COUNT(1) AS c FROM notes WHERE request_id = ?').get(request.id);
  db.close();
  assert.equal(orphans.c, 0, 'notes must not survive their request');
});

test('DELETE /api/maintenance/:id returns 404 for an unknown request', async () => {
  const res = await h.del('/api/maintenance/999999');
  assert.equal(res.status, 404);
});
