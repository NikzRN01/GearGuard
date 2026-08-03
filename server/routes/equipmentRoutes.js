const express = require('express');
const db = require('../database');
const {
  LIMITS,
  badRequest,
  notFound,
  conflict,
  requiredString,
  optionalString,
  optionalId,
  toId,
  optionalDate,
  route,
  isUniqueViolation
} = require('../lib/validation');
const { authorize, audit } = require('../middleware/auth');

const router = express.Router();

// Administrators are a super-role: governance access plus every operational
// capability available to managers.
router.use(authorize('user', 'technician', 'manager', 'admin'));

/** Fields a client may set, with the validator each one is put through. */
const parseEquipmentFields = (body = {}) => ({
  name: optionalString(body.name, 'Equipment name', LIMITS.name),
  serial_number: optionalString(body.serial_number, 'Serial number', LIMITS.shortText),
  category: optionalString(body.category, 'Category', LIMITS.shortText),
  department: optionalString(body.department, 'Department', LIMITS.shortText),
  assigned_employee_name: optionalString(body.assigned_employee_name, 'Assigned employee', LIMITS.name),
  purchase_date: optionalDate(body.purchase_date, 'Purchase date'),
  warranty_end_date: optionalDate(body.warranty_end_date, 'Warranty end date'),
  location: optionalString(body.location, 'Location', LIMITS.shortText),
  maintenance_team_id: optionalId(body.maintenance_team_id, 'Maintenance team'),
  status: optionalString(body.status, 'Status', 40)
});

const assertTeamExists = async (teamId) => {
  if (!teamId) return;
  const team = await db.get('SELECT id FROM teams WHERE id = ?', [teamId]);
  if (!team) throw notFound('Maintenance team not found');
};

// Get all equipment
router.get('/', route(async (req, res) => {
  const { department, employee, status } = req.query;

  let query = `
    SELECT
      e.*,
      t.name as team_name
    FROM equipment e
    LEFT JOIN teams t ON e.maintenance_team_id = t.id
    WHERE 1=1
  `;
  const params = [];

  if (department) {
    query += ' AND e.department = ?';
    params.push(String(department));
  }

  if (employee) {
    query += ' AND e.assigned_employee_name = ?';
    params.push(String(employee));
  }

  if (status) {
    query += ' AND e.status = ?';
    params.push(String(status));
  }

  query += ' ORDER BY e.created_at DESC, e.id DESC';

  const equipment = await db.all(query, params);

  res.json({ success: true, data: equipment });
}));

// Get single equipment by ID
router.get('/:id', route(async (req, res) => {
  const id = toId(req.params.id);
  if (!id) throw notFound('Equipment not found');

  const equipment = await db.get(`
    SELECT
      e.*,
      t.name as team_name
    FROM equipment e
    LEFT JOIN teams t ON e.maintenance_team_id = t.id
    WHERE e.id = ?
  `, [id]);

  if (!equipment) throw notFound('Equipment not found');

  res.json({ success: true, data: equipment });
}));

// Create new equipment
router.post('/', authorize('manager', 'admin'), route(async (req, res) => {
  const body = req.body || {};

  // Validate required fields
  const name = requiredString(body.name, 'Equipment name', LIMITS.name);
  const serialNumber = requiredString(body.serial_number, 'Serial number', LIMITS.shortText);
  const fields = parseEquipmentFields(body);

  // Check for duplicate serial number
  const existing = await db.get('SELECT id FROM equipment WHERE serial_number = ?', [serialNumber]);
  if (existing) {
    throw conflict('Equipment with this serial number already exists');
  }

  // Validate team exists if provided
  await assertTeamExists(fields.maintenance_team_id);

  let created;
  try {
    created = await db.insert(`
      INSERT INTO equipment (
        name, serial_number, category, department, assigned_employee_name,
        purchase_date, warranty_end_date, location, maintenance_team_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name,
      serialNumber,
      fields.category ?? null,
      fields.department ?? null,
      fields.assigned_employee_name ?? null,
      fields.purchase_date ?? null,
      fields.warranty_end_date ?? null,
      fields.location ?? null,
      fields.maintenance_team_id ?? null,
      fields.status ?? 'active'
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('Equipment with this serial number already exists');
    throw error;
  }

  await audit(req.user.id, 'equipment.create', 'equipment', created.id, {
    name,
    serial_number: serialNumber
  });

  res.status(201).json({
    success: true,
    message: 'Equipment created successfully',
    data: { id: created.id }
  });
}));

// Update equipment.
// Only the fields present in the body are written, so a partial update cannot
// silently blank out columns the caller never mentioned.
router.put('/:id', authorize('manager', 'admin'), route(async (req, res) => {
  const id = toId(req.params.id);
  if (!id) throw notFound('Equipment not found');

  // The whole row, not just the id: the audit entry records what each changed
  // column held before, which is the part an investigation actually needs.
  const existing = await db.get('SELECT * FROM equipment WHERE id = ?', [id]);
  if (!existing) throw notFound('Equipment not found');

  const fields = parseEquipmentFields(req.body || {});

  if (fields.name === null) throw badRequest('Equipment name cannot be blank');
  if (fields.serial_number === null) throw badRequest('Serial number cannot be blank');

  // Check for duplicate serial number (excluding current equipment)
  if (fields.serial_number) {
    const duplicate = await db.get('SELECT id FROM equipment WHERE serial_number = ? AND id != ?', [fields.serial_number, id]);
    if (duplicate) {
      throw conflict('Equipment with this serial number already exists');
    }
  }

  // Validate team exists if provided
  await assertTeamExists(fields.maintenance_team_id);

  const assignments = [];
  const params = [];
  const changes = {};
  for (const [column, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    assignments.push(`${column} = ?`);
    params.push(value);
    // Only genuinely changed columns are worth recording; the edit form resends
    // every field on each save, so without this the log would be noise.
    if (existing[column] !== value) changes[column] = { from: existing[column] ?? null, to: value };
  }

  if (assignments.length > 0) {
    params.push(id);
    try {
      await db.run(`UPDATE equipment SET ${assignments.join(', ')} WHERE id = ?`, params);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw conflict('Equipment with this serial number already exists');
      }
      throw error;
    }
  }

  if (Object.keys(changes).length > 0) {
    await audit(req.user.id, 'equipment.update', 'equipment', id, { changes });
  }

  res.json({
    success: true,
    message: 'Equipment updated successfully'
  });
}));

// Delete equipment
router.delete('/:id', authorize('manager', 'admin'), route(async (req, res) => {
  const id = toId(req.params.id);
  if (!id) throw notFound('Equipment not found');

  const existing = await db.get('SELECT id, name, serial_number FROM equipment WHERE id = ?', [id]);
  if (!existing) throw notFound('Equipment not found');

  // Check if equipment has maintenance requests
  const hasRequests = await db.get('SELECT id FROM maintenance_requests WHERE equipment_id = ? LIMIT 1', [id]);
  if (hasRequests) {
    throw badRequest('Cannot delete equipment with existing maintenance requests');
  }

  await db.run('DELETE FROM equipment WHERE id = ?', [id]);

  // Recorded after the fact: once the row is gone the audit entry is the only
  // remaining trace of what was removed.
  await audit(req.user.id, 'equipment.delete', 'equipment', id, {
    name: existing.name,
    serial_number: existing.serial_number
  });

  res.json({
    success: true,
    message: 'Equipment deleted successfully'
  });
}));

module.exports = router;
