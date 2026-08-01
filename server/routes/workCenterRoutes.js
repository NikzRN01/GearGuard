const express = require('express');
const db = require('../database');
const {
  LIMITS,
  badRequest,
  notFound,
  conflict,
  requiredString,
  optionalString,
  requiredId,
  toId,
  optionalNumber,
  optionalEnum,
  likePattern,
  route,
  isUniqueViolation
} = require('../lib/validation');
const { authorize } = require('../middleware/auth');

const router = express.Router();

// Administrators are a super-role: governance access plus every operational
// capability available to managers.
router.use(authorize('user', 'technician', 'manager', 'admin'));

const STATUSES = ['active', 'inactive'];

/**
 * Numeric bounds here mirror the CHECK constraints in the schema, so an
 * out-of-range value is reported as a validation error instead of surfacing as
 * a constraint failure and a 500.
 */
const parseWorkCenterFields = (body = {}) => ({
  name: optionalString(body.name, 'Name', LIMITS.name),
  code: optionalString(body.code, 'Code', LIMITS.code),
  tag: optionalString(body.tag, 'Tag', LIMITS.tag),
  cost_per_hour: optionalNumber(body.cost_per_hour, 'Cost per hour', { min: 0 }),
  capacity_per_hour: optionalNumber(body.capacity_per_hour, 'Capacity per hour', { min: 0 }),
  time_efficiency_pct: optionalNumber(body.time_efficiency_pct, 'Time efficiency', { min: 0, max: 100 }),
  oee_target_pct: optionalNumber(body.oee_target_pct, 'OEE target', { min: 0, max: 100 }),
  status: optionalEnum(body.status, 'Status', STATUSES)
});

const findWorkCenter = (rawId) => {
  const id = toId(rawId);
  if (!id) throw notFound('Work center not found');
  const wc = db.prepare('SELECT * FROM work_centers WHERE id = ?').get(id);
  if (!wc) throw notFound('Work center not found');
  return wc;
};

/** Maps a UNIQUE violation onto the field that actually collided. */
const conflictForUnique = (error) => {
  if (/work_centers\.code/i.test(error.message)) {
    return conflict('Work center with this code already exists');
  }
  return conflict('Work center with this name already exists');
};

// List work centers with optional filters
router.get('/', route((req, res) => {
  const { status, search } = req.query;
  let query = `
    SELECT wc.* FROM work_centers wc
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    query += ' AND wc.status = ?';
    params.push(String(status));
  }
  if (search) {
    // ESCAPE keeps % and _ in the search box as literal characters.
    query += " AND (wc.name LIKE ? ESCAPE '\\' OR wc.code LIKE ? ESCAPE '\\' OR wc.tag LIKE ? ESCAPE '\\')";
    const like = likePattern(search);
    params.push(like, like, like);
  }
  query += ' ORDER BY wc.name';

  const data = db.prepare(query).all(...params);
  res.json({ success: true, data });
}));

// Get single work center with alternatives
router.get('/:id', route((req, res) => {
  const wc = findWorkCenter(req.params.id);
  const alternatives = db.prepare(`
    SELECT wca.id, wca.alternative_work_center_id as alt_id, wc2.name as alt_name
    FROM work_center_alternatives wca
    JOIN work_centers wc2 ON wc2.id = wca.alternative_work_center_id
    WHERE wca.work_center_id = ?
    ORDER BY wc2.name
  `).all(wc.id);
  res.json({ success: true, data: { ...wc, alternatives } });
}));

// Create work center
router.post('/', authorize('manager', 'admin'), route((req, res) => {
  const body = req.body || {};
  const name = requiredString(body.name, 'Name', LIMITS.name);
  const fields = parseWorkCenterFields(body);

  const dup = db.prepare('SELECT id FROM work_centers WHERE name = ?').get(name);
  if (dup) {
    throw conflict('Work center with this name already exists');
  }
  if (fields.code) {
    const codeDup = db.prepare('SELECT id FROM work_centers WHERE code = ?').get(fields.code);
    if (codeDup) throw conflict('Work center with this code already exists');
  }

  const stmt = db.prepare(`
    INSERT INTO work_centers (
      name, code, tag, cost_per_hour, capacity_per_hour,
      time_efficiency_pct, oee_target_pct, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let result;
  try {
    result = stmt.run(
      name,
      fields.code ?? null,
      fields.tag ?? null,
      fields.cost_per_hour ?? 0,
      fields.capacity_per_hour ?? 0,
      fields.time_efficiency_pct ?? 100,
      fields.oee_target_pct ?? 0,
      fields.status ?? 'active'
    );
  } catch (error) {
    if (isUniqueViolation(error)) throw conflictForUnique(error);
    throw error;
  }

  res.status(201).json({ success: true, message: 'Work center created', data: { id: result.lastInsertRowid } });
}));

// Update work center. Only supplied fields are written.
router.put('/:id', authorize('manager', 'admin'), route((req, res) => {
  const wc = findWorkCenter(req.params.id);
  const fields = parseWorkCenterFields(req.body || {});

  if (fields.name === null) throw badRequest('Name cannot be blank');

  if (fields.name) {
    const dup = db.prepare('SELECT id FROM work_centers WHERE name = ? AND id != ?').get(fields.name, wc.id);
    if (dup) throw conflict('Work center with this name already exists');
  }
  if (fields.code) {
    const codeDup = db.prepare('SELECT id FROM work_centers WHERE code = ? AND id != ?').get(fields.code, wc.id);
    if (codeDup) throw conflict('Work center with this code already exists');
  }

  const assignments = [];
  const params = [];
  for (const [column, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    assignments.push(`${column} = ?`);
    params.push(value);
  }

  if (assignments.length > 0) {
    params.push(wc.id);
    try {
      db.prepare(`UPDATE work_centers SET ${assignments.join(', ')} WHERE id = ?`).run(...params);
    } catch (error) {
      if (isUniqueViolation(error)) throw conflictForUnique(error);
      throw error;
    }
  }

  res.json({ success: true, message: 'Work center updated' });
}));

// Soft delete (deactivate) work center
router.delete('/:id', authorize('manager', 'admin'), route((req, res) => {
  const wc = findWorkCenter(req.params.id);
  db.prepare("UPDATE work_centers SET status = 'inactive' WHERE id = ?").run(wc.id);
  res.json({ success: true, message: 'Work center deactivated' });
}));

// Alternatives
router.get('/:id/alternatives', route((req, res) => {
  const wc = findWorkCenter(req.params.id);
  const rows = db.prepare(`
    SELECT wca.id, wca.alternative_work_center_id as alt_id, wc2.name as alt_name
    FROM work_center_alternatives wca
    JOIN work_centers wc2 ON wc2.id = wca.alternative_work_center_id
    WHERE wca.work_center_id = ?
    ORDER BY wc2.name
  `).all(wc.id);
  res.json({ success: true, data: rows });
}));

router.post('/:id/alternatives', authorize('manager', 'admin'), route((req, res) => {
  const wc = findWorkCenter(req.params.id);
  const alternativeId = requiredId(
    (req.body || {}).alternative_work_center_id,
    'alternative_work_center_id'
  );

  if (alternativeId === wc.id) {
    throw badRequest('A work center cannot be its own alternative');
  }

  const exists = db.prepare('SELECT id FROM work_centers WHERE id = ?').get(alternativeId);
  if (!exists) throw notFound('Alternative work center not found');

  let result;
  try {
    result = db
      .prepare('INSERT INTO work_center_alternatives (work_center_id, alternative_work_center_id) VALUES (?, ?)')
      .run(wc.id, alternativeId);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('Alternative already linked');
    throw error;
  }

  res.status(201).json({ success: true, message: 'Alternative added', data: { id: result.lastInsertRowid } });
}));

router.delete('/:id/alternatives/:altId', authorize('manager', 'admin'), route((req, res) => {
  const workCenterId = toId(req.params.id);
  const altId = toId(req.params.altId);
  if (!workCenterId || !altId) throw notFound('Alternative link not found');

  const existing = db
    .prepare('SELECT id FROM work_center_alternatives WHERE id = ? AND work_center_id = ?')
    .get(altId, workCenterId);
  if (!existing) throw notFound('Alternative link not found');

  db.prepare('DELETE FROM work_center_alternatives WHERE id = ?').run(altId);
  res.json({ success: true, message: 'Alternative removed' });
}));

module.exports = router;
