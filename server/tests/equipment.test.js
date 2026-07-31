const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');

test.after(() => h.stop());

test('GET /api/equipment returns the seeded register', async () => {
  const res = await h.get('/api/equipment');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(Array.isArray(res.body.data));
  assert.ok(res.body.data.length >= 3, 'demo seed should provide equipment');
});

test('POST /api/equipment creates a record and echoes its id', async () => {
  const eq = await h.createEquipment({ department: 'Printers', location: 'Office' });
  const res = await h.get(`/api/equipment/${eq.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.name, eq.name);
  assert.equal(res.body.data.department, 'Printers');
  assert.equal(res.body.data.status, 'active');
});

test('POST /api/equipment persists the category column', async () => {
  const eq = await h.createEquipment({ category: 'Computers' });
  const res = await h.get(`/api/equipment/${eq.id}`);
  assert.equal(res.body.data.category, 'Computers', 'category is in the schema and shown in the UI');
});

test('POST /api/equipment requires name and serial number', async () => {
  const noName = await h.post('/api/equipment', { serial_number: `SN-${h.uid()}` });
  assert.equal(noName.status, 400);
  const noSerial = await h.post('/api/equipment', { name: 'Nameless' });
  assert.equal(noSerial.status, 400);
});

test('POST /api/equipment rejects a duplicate serial number with 409', async () => {
  const eq = await h.createEquipment();
  const res = await h.post('/api/equipment', { name: 'Clone', serial_number: eq.serial_number });
  assert.equal(res.status, 409);
});

test('POST /api/equipment rejects an unknown maintenance team', async () => {
  const res = await h.post('/api/equipment', {
    name: 'Orphan',
    serial_number: `SN-${h.uid()}`,
    maintenance_team_id: 999999
  });
  assert.equal(res.status, 404);
});

test('POST /api/equipment links a real maintenance team', async () => {
  const team = await h.createTeam();
  const eq = await h.createEquipment({ maintenance_team_id: team.id });
  const res = await h.get(`/api/equipment/${eq.id}`);
  assert.equal(res.body.data.maintenance_team_id, team.id);
  assert.equal(res.body.data.team_name, team.name);
});

test('GET /api/equipment/:id returns 404 for an unknown id', async () => {
  const res = await h.get('/api/equipment/999999');
  assert.equal(res.status, 404);
});

test('GET /api/equipment filters by department, employee and status', async () => {
  const department = `Dept-${h.uid()}`;
  const employee = `Employee-${h.uid()}`;
  await h.createEquipment({ department, assigned_employee_name: employee, status: 'active' });
  await h.createEquipment({ department, assigned_employee_name: employee, status: 'retired' });

  const byDepartment = await h.get('/api/equipment', { query: { department } });
  assert.equal(byDepartment.body.data.length, 2);

  const byEmployee = await h.get('/api/equipment', { query: { employee } });
  assert.equal(byEmployee.body.data.length, 2);

  const byStatus = await h.get('/api/equipment', { query: { department, status: 'retired' } });
  assert.equal(byStatus.body.data.length, 1);
  assert.equal(byStatus.body.data[0].status, 'retired');
});

test('PUT /api/equipment/:id updates the supplied fields', async () => {
  const eq = await h.createEquipment({ department: 'Old', location: 'Old wing' });
  const res = await h.put(`/api/equipment/${eq.id}`, {
    name: 'Renamed',
    serial_number: eq.serial_number,
    department: 'New',
    assigned_employee_name: 'Grace Hopper',
    purchase_date: '2024-01-01',
    warranty_end_date: '2026-01-01',
    location: 'New wing',
    maintenance_team_id: null,
    status: 'active'
  });
  assert.equal(res.status, 200);

  const after = await h.get(`/api/equipment/${eq.id}`);
  assert.equal(after.body.data.name, 'Renamed');
  assert.equal(after.body.data.department, 'New');
  assert.equal(after.body.data.location, 'New wing');
  assert.equal(after.body.data.assigned_employee_name, 'Grace Hopper');
});

test('PUT /api/equipment/:id does not blank out fields the caller omitted', async () => {
  const eq = await h.createEquipment({
    category: 'Printers',
    department: 'Keep',
    location: 'Bay 1',
    assigned_employee_name: 'Grace Hopper',
    purchase_date: '2024-02-02',
    warranty_end_date: '2027-02-02'
  });

  const res = await h.put(`/api/equipment/${eq.id}`, { name: 'Only the name changed' });
  assert.equal(res.status, 200, `partial update failed: ${res.text}`);

  const after = await h.get(`/api/equipment/${eq.id}`);
  assert.equal(after.body.data.name, 'Only the name changed');
  assert.equal(after.body.data.serial_number, eq.serial_number, 'omitted serial must be preserved');
  assert.equal(after.body.data.category, 'Printers', 'omitted category was wiped');
  assert.equal(after.body.data.department, 'Keep', 'omitted department was wiped');
  assert.equal(after.body.data.location, 'Bay 1', 'omitted location was wiped');
  assert.equal(after.body.data.assigned_employee_name, 'Grace Hopper', 'omitted employee was wiped');
  assert.equal(after.body.data.purchase_date, '2024-02-02', 'omitted purchase date was wiped');
  assert.equal(after.body.data.warranty_end_date, '2027-02-02', 'omitted warranty date was wiped');
});

test('PUT /api/equipment/:id clears a field when it is explicitly set to null', async () => {
  const eq = await h.createEquipment({ department: 'Temporary' });
  const res = await h.put(`/api/equipment/${eq.id}`, { department: null });
  assert.equal(res.status, 200);

  const after = await h.get(`/api/equipment/${eq.id}`);
  assert.equal(after.body.data.department, null);
});

test('PUT /api/equipment/:id updates the category', async () => {
  const eq = await h.createEquipment({ category: 'Old' });
  const res = await h.put(`/api/equipment/${eq.id}`, { category: 'Monitors' });
  assert.equal(res.status, 200);

  const after = await h.get(`/api/equipment/${eq.id}`);
  assert.equal(after.body.data.category, 'Monitors');
});

test('PUT /api/equipment/:id rejects a malformed date', async () => {
  const eq = await h.createEquipment();
  const res = await h.put(`/api/equipment/${eq.id}`, { purchase_date: '2024-13-45' });
  assert.equal(res.status, 400, 'an impossible calendar date must not be stored');
});

test('PUT /api/equipment/:id returns 404 for an unknown id', async () => {
  const res = await h.put('/api/equipment/999999', { name: 'Nope' });
  assert.equal(res.status, 404);
});

test('PUT /api/equipment/:id rejects a serial number already used elsewhere', async () => {
  const a = await h.createEquipment();
  const b = await h.createEquipment();
  const res = await h.put(`/api/equipment/${b.id}`, { serial_number: a.serial_number });
  assert.equal(res.status, 409);
});

test('PUT /api/equipment/:id rejects an unknown maintenance team', async () => {
  const eq = await h.createEquipment();
  const res = await h.put(`/api/equipment/${eq.id}`, { maintenance_team_id: 999999 });
  assert.equal(res.status, 404);
});

test('DELETE /api/equipment/:id removes an unused record', async () => {
  const eq = await h.createEquipment();
  const res = await h.del(`/api/equipment/${eq.id}`);
  assert.equal(res.status, 200);
  const after = await h.get(`/api/equipment/${eq.id}`);
  assert.equal(after.status, 404);
});

test('DELETE /api/equipment/:id is blocked while maintenance requests exist', async () => {
  const eq = await h.createEquipment();
  await h.createRequest({ equipment_id: eq.id });
  const res = await h.del(`/api/equipment/${eq.id}`);
  assert.equal(res.status, 400);
  assert.match(res.body.message, /maintenance requests/i);
});

test('DELETE /api/equipment/:id returns 404 for an unknown id', async () => {
  const res = await h.del('/api/equipment/999999');
  assert.equal(res.status, 404);
});
