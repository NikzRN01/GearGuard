const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');

test.after(() => h.stop());

test('GET /api/teams returns teams with an accurate member count', async () => {
  const team = await h.createTeam();
  const a = await h.createUser('technician');
  const b = await h.createUser('technician');
  await h.post(`/api/teams/${team.id}/members`, { user_id: a.id });
  await h.post(`/api/teams/${team.id}/members`, { user_id: b.id });

  const res = await h.get('/api/teams');
  assert.equal(res.status, 200);
  const row = res.body.data.find((t) => t.id === team.id);
  assert.equal(row.member_count, 2);
});

test('GET /api/teams/:id returns the team with its members', async () => {
  const team = await h.createTeam();
  const user = await h.createUser('technician');
  await h.post(`/api/teams/${team.id}/members`, { user_id: user.id });

  const res = await h.get(`/api/teams/${team.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.name, team.name);
  assert.equal(res.body.data.members.length, 1);
  assert.equal(res.body.data.members[0].email, user.email);
});

test('GET /api/teams/:id returns 404 for an unknown team', async () => {
  const res = await h.get('/api/teams/999999');
  assert.equal(res.status, 404);
});

test('POST /api/teams requires a name and rejects duplicates', async () => {
  const missing = await h.post('/api/teams', {});
  assert.equal(missing.status, 400);

  const team = await h.createTeam();
  const duplicate = await h.post('/api/teams', { name: team.name });
  assert.equal(duplicate.status, 409);
});

test('POST /api/teams rejects a blank or whitespace-only name', async () => {
  const blank = await h.post('/api/teams', { name: '   ' });
  assert.equal(blank.status, 400, 'a whitespace-only team name must not be accepted');
});

test('PUT /api/teams/:id renames a team', async () => {
  const team = await h.createTeam();
  const name = `Renamed ${h.uid()}`;
  const res = await h.put(`/api/teams/${team.id}`, { name });
  assert.equal(res.status, 200);

  const after = await h.get(`/api/teams/${team.id}`);
  assert.equal(after.body.data.name, name);
});

test('PUT /api/teams/:id rejects an unknown id and a duplicate name', async () => {
  const a = await h.createTeam();
  const b = await h.createTeam();

  const unknown = await h.put('/api/teams/999999', { name: `X ${h.uid()}` });
  assert.equal(unknown.status, 404);

  const duplicate = await h.put(`/api/teams/${b.id}`, { name: a.name });
  assert.equal(duplicate.status, 409);
});

test('DELETE /api/teams/:id removes an unused team', async () => {
  const team = await h.createTeam();
  const res = await h.del(`/api/teams/${team.id}`);
  assert.equal(res.status, 200);
  const after = await h.get(`/api/teams/${team.id}`);
  assert.equal(after.status, 404);
});

test('DELETE /api/teams/:id is blocked while equipment references the team', async () => {
  const team = await h.createTeam();
  await h.createEquipment({ maintenance_team_id: team.id });
  const res = await h.del(`/api/teams/${team.id}`);
  assert.equal(res.status, 400);
});

test('DELETE /api/teams/:id is blocked while maintenance requests reference the team', async () => {
  const team = await h.createTeam();
  const equipment = await h.createEquipment({ maintenance_team_id: team.id });
  await h.createRequest({ equipment_id: equipment.id });

  // Detach the team from the equipment so the request is the only thing left
  // pointing at it.
  const detach = await h.put(`/api/equipment/${equipment.id}`, { maintenance_team_id: null });
  assert.equal(detach.status, 200);

  const stillReferenced = await h.get('/api/maintenance', { query: { team_id: team.id } });
  assert.ok(stillReferenced.body.data.length > 0, 'the request should still carry the team');

  const res = await h.del(`/api/teams/${team.id}`);
  assert.notEqual(res.status, 200, 'deleting the team would orphan its maintenance requests');
});

test('POST /api/teams/:id/members validates team, user and duplicates', async () => {
  const team = await h.createTeam();
  const user = await h.createUser('technician');

  const missing = await h.post(`/api/teams/${team.id}/members`, {});
  assert.equal(missing.status, 400);

  const unknownTeam = await h.post('/api/teams/999999/members', { user_id: user.id });
  assert.equal(unknownTeam.status, 404);

  const unknownUser = await h.post(`/api/teams/${team.id}/members`, { user_id: 999999 });
  assert.equal(unknownUser.status, 404);

  const first = await h.post(`/api/teams/${team.id}/members`, { user_id: user.id });
  assert.equal(first.status, 201);

  const duplicate = await h.post(`/api/teams/${team.id}/members`, { user_id: user.id });
  assert.equal(duplicate.status, 409);
});

test('DELETE /api/teams/:id/members/:userId removes a membership', async () => {
  const team = await h.createTeam();
  const user = await h.createUser('technician');
  await h.post(`/api/teams/${team.id}/members`, { user_id: user.id });

  const res = await h.del(`/api/teams/${team.id}/members/${user.id}`);
  assert.equal(res.status, 200);

  const after = await h.get(`/api/teams/${team.id}`);
  assert.equal(after.body.data.members.length, 0);

  const repeat = await h.del(`/api/teams/${team.id}/members/${user.id}`);
  assert.equal(repeat.status, 404);
});

test('GET /api/teams/:id/available-users excludes members and non-eligible roles', async () => {
  const team = await h.createTeam();
  const member = await h.createUser('technician');
  const candidate = await h.createUser('technician');
  const plainUser = await h.createUser('user');
  await h.post(`/api/teams/${team.id}/members`, { user_id: member.id });

  const res = await h.get(`/api/teams/${team.id}/available-users`);
  assert.equal(res.status, 200);
  const ids = res.body.data.map((u) => u.id);
  assert.ok(ids.includes(candidate.id), 'an eligible technician should be offered');
  assert.ok(!ids.includes(member.id), 'existing members must be excluded');
  assert.ok(!ids.includes(plainUser.id), 'plain users are not eligible for teams');
});

test('GET /api/teams/:id/available-users returns 404 for an unknown team', async () => {
  const res = await h.get('/api/teams/999999/available-users');
  assert.equal(res.status, 404, 'an unknown team should not silently return a user list');
});

test('GET /api/teams/users/all lists users without exposing password hashes', async () => {
  const res = await h.get('/api/teams/users/all');
  assert.equal(res.status, 200);
  assert.ok(res.body.data.length > 0);
  for (const user of res.body.data) {
    assert.equal(user.password, undefined);
  }
});
