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
const { authorize, audit } = require('../middleware/auth');

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

const findWorkCenter = async (rawId) => {
  const id = toId(rawId);
  if (!id) throw notFound('Work center not found');
  const wc = await db.get('SELECT * FROM work_centers WHERE id = ?', [id]);
  if (!wc) throw notFound('Work center not found');
  return wc;
};

/**
 * Maps a UNIQUE violation onto the field that actually collided.
 *
 * PostgreSQL names the offending constraint on the error (`work_centers_code_key`
 * for a UNIQUE column), which is far more reliable than the message text this
 * used to parse out of SQLite.
 */
const conflictForUnique = (error) => {
  const target = `${error?.constraint || ''} ${error?.detail || ''} ${error?.message || ''}`;
  if (/code/i.test(target)) {
    return conflict('Work center with this code already exists');
  }
  return conflict('Work center with this name already exists');
};

// List work centers with optional filters
router.get('/', route(async (req, res) => {
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

  const data = await db.all(query, params);
  res.json({ success: true, data });
}));

// Get single work center with alternatives
router.get('/:id', route(async (req, res) => {
  const wc = await findWorkCenter(req.params.id);
  const alternatives = await db.all(`
    SELECT wca.id, wca.alternative_work_center_id as alt_id, wc2.name as alt_name
    FROM work_center_alternatives wca
    JOIN work_centers wc2 ON wc2.id = wca.alternative_work_center_id
    WHERE wca.work_center_id = ?
    ORDER BY wc2.name
  `, [wc.id]);
  res.json({ success: true, data: { ...wc, alternatives } });
}));

// Create work center
router.post('/', authorize('manager', 'admin'), route(async (req, res) => {
  const body = req.body || {};
  const name = requiredString(body.name, 'Name', LIMITS.name);
  const fields = parseWorkCenterFields(body);

  const dup = await db.get('SELECT id FROM work_centers WHERE name = ?', [name]);
  if (dup) {
    throw conflict('Work center with this name already exists');
  }
  if (fields.code) {
    const codeDup = await db.get('SELECT id FROM work_centers WHERE code = ?', [fields.code]);
    if (codeDup) throw conflict('Work center with this code already exists');
  }

  let created;
  try {
    created = await db.insert(`
      INSERT INTO work_centers (
        name, code, tag, cost_per_hour, capacity_per_hour,
        time_efficiency_pct, oee_target_pct, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name,
      fields.code ?? null,
      fields.tag ?? null,
      fields.cost_per_hour ?? 0,
      fields.capacity_per_hour ?? 0,
      fields.time_efficiency_pct ?? 100,
      fields.oee_target_pct ?? 0,
      fields.status ?? 'active'
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflictForUnique(error);
    throw error;
  }

  await audit(req.user.id, 'workcenter.create', 'work_center', created.id, {
    name,
    code: fields.code ?? null
  });

  res.status(201).json({ success: true, message: 'Work center created', data: { id: created.id } });
}));

// Update work center. Only supplied fields are written.
router.put('/:id', authorize('manager', 'admin'), route(async (req, res) => {
  const wc = await findWorkCenter(req.params.id);
  const fields = parseWorkCenterFields(req.body || {});

  if (fields.name === null) throw badRequest('Name cannot be blank');

  if (fields.name) {
    const dup = await db.get('SELECT id FROM work_centers WHERE name = ? AND id != ?', [fields.name, wc.id]);
    if (dup) throw conflict('Work center with this name already exists');
  }
  if (fields.code) {
    const codeDup = await db.get('SELECT id FROM work_centers WHERE code = ? AND id != ?', [fields.code, wc.id]);
    if (codeDup) throw conflict('Work center with this code already exists');
  }

  const assignments = [];
  const params = [];
  const changes = {};
  for (const [column, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    assignments.push(`${column} = ?`);
    params.push(value);
    // Cost and capacity are commercially meaningful, so record what they were.
    if (wc[column] !== value) changes[column] = { from: wc[column] ?? null, to: value };
  }

  if (assignments.length > 0) {
    params.push(wc.id);
    try {
      await db.run(`UPDATE work_centers SET ${assignments.join(', ')} WHERE id = ?`, params);
    } catch (error) {
      if (isUniqueViolation(error)) throw conflictForUnique(error);
      throw error;
    }
  }

  if (Object.keys(changes).length > 0) {
    await audit(req.user.id, 'workcenter.update', 'work_center', wc.id, { changes });
  }

  res.json({ success: true, message: 'Work center updated' });
}));

// Soft delete (deactivate) work center
router.delete('/:id', authorize('manager', 'admin'), route(async (req, res) => {
  const wc = await findWorkCenter(req.params.id);
  await db.run("UPDATE work_centers SET status = 'inactive' WHERE id = ?", [wc.id]);

  await audit(req.user.id, 'workcenter.deactivate', 'work_center', wc.id, {
    name: wc.name,
    status: { from: wc.status, to: 'inactive' }
  });

  res.json({ success: true, message: 'Work center deactivated' });
}));

// Alternatives
router.get('/:id/alternatives', route(async (req, res) => {
  const wc = await findWorkCenter(req.params.id);
  const rows = await db.all(`
    SELECT wca.id, wca.alternative_work_center_id as alt_id, wc2.name as alt_name
    FROM work_center_alternatives wca
    JOIN work_centers wc2 ON wc2.id = wca.alternative_work_center_id
    WHERE wca.work_center_id = ?
    ORDER BY wc2.name
  `, [wc.id]);
  res.json({ success: true, data: rows });
}));

router.post('/:id/alternatives', authorize('manager', 'admin'), route(async (req, res) => {
  const wc = await findWorkCenter(req.params.id);
  const alternativeId = requiredId(
    (req.body || {}).alternative_work_center_id,
    'alternative_work_center_id'
  );

  if (alternativeId === wc.id) {
    throw badRequest('A work center cannot be its own alternative');
  }

  const exists = await db.get('SELECT id FROM work_centers WHERE id = ?', [alternativeId]);
  if (!exists) throw notFound('Alternative work center not found');

  let created;
  try {
    created = await db.insert('INSERT INTO work_center_alternatives (work_center_id, alternative_work_center_id) VALUES (?, ?)', [wc.id, alternativeId]);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('Alternative already linked');
    throw error;
  }

  await audit(req.user.id, 'workcenter.alternative.add', 'work_center', wc.id, {
    alternative_work_center_id: Number(alternativeId)
  });

  res.status(201).json({ success: true, message: 'Alternative added', data: { id: created.id } });
}));

router.delete('/:id/alternatives/:altId', authorize('manager', 'admin'), route(async (req, res) => {
  const workCenterId = toId(req.params.id);
  const altId = toId(req.params.altId);
  if (!workCenterId || !altId) throw notFound('Alternative link not found');

  const existing = await db.get('SELECT id, alternative_work_center_id FROM work_center_alternatives WHERE id = ? AND work_center_id = ?', [altId, workCenterId]);
  if (!existing) throw notFound('Alternative link not found');

  await db.run('DELETE FROM work_center_alternatives WHERE id = ?', [altId]);

  await audit(req.user.id, 'workcenter.alternative.remove', 'work_center', workCenterId, {
    alternative_work_center_id: existing.alternative_work_center_id
  });

  res.json({ success: true, message: 'Alternative removed' });
}));

module.exports = router;
