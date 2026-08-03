const express = require('express');
const db = require('../database');
const {
  LIMITS,
  badRequest,
  notFound,
  forbidden,
  requiredString,
  optionalString,
  requiredId,
  optionalId,
  toId,
  optionalNumber,
  optionalDate,
  requiredEnum,
  optionalEnum,
  route
} = require('../lib/validation');
const { authorize, audit } = require('../middleware/auth');

const router = express.Router();

// Administrators are a super-role: governance access plus every operational
// capability available to managers.
router.use(authorize('user', 'technician', 'manager', 'admin'));

const TYPES = ['corrective', 'preventive'];
const STATUSES = ['new', 'in_progress', 'repaired', 'scrap'];
const CLOSED_STATUSES = ['repaired', 'scrap'];

// A single work session cannot plausibly exceed this; the cap keeps nonsense
// values such as 1e308 out of reports and charts.
const MAX_DURATION_HOURS = 10000;

const VALID_TRANSITIONS = {
  new: ['in_progress', 'scrap'],
  in_progress: ['repaired', 'scrap'],
  repaired: [],
  scrap: []
};

/**
 * Row-level visibility. Managers and admins see the whole queue; a technician
 * sees only what is assigned to them, and a plain user only what they raised.
 * Applied in SQL so a caller cannot widen it with query parameters.
 */
const scopeToCaller = (req, push) => {
  if (req.user.role === 'technician') push(' AND mr.assigned_to_user_id = ?', req.user.id);
  else if (req.user.role === 'user') push(' AND mr.created_by_user_id = ?', req.user.id);
};

/** Whether the caller may see or comment on a specific request. */
const canAccess = (req, request) =>
  ['manager', 'admin'].includes(req.user.role)
  || (req.user.role === 'technician' && Number(request.assigned_to_user_id) === Number(req.user.id))
  || (req.user.role === 'user' && Number(request.created_by_user_id) === Number(req.user.id));

const findRequest = async (rawId, columns = 'id, status, team_id, type, equipment_id, work_center_id, scheduled_date, assigned_to_user_id, created_by_user_id') => {
  const id = toId(rawId);
  if (!id) throw notFound('Maintenance request not found');
  const request = await db.get(`SELECT ${columns} FROM maintenance_requests WHERE id = ?`, [id]);
  if (!request) throw notFound('Maintenance request not found');
  return request;
};

const assertTeamExists = async (teamId) => {
  if (!teamId) return;
  const team = await db.get('SELECT id FROM teams WHERE id = ?', [teamId]);
  if (!team) throw notFound('Maintenance team not found');
};

// Get all maintenance requests
router.get('/', route(async (req, res) => {
  const { status, type, team_id, assigned_to, scheduled_date, equipment_id, work_center_id } = req.query;

  let query = `
    SELECT
      mr.*,
      e.name as equipment_name,
      e.serial_number,
      e.department,
      e.assigned_employee_name,
      wc.name as work_center_name,
      t.name as team_name,
      u.name as assigned_to_name,
      c.name as created_by_name
    FROM maintenance_requests mr
    LEFT JOIN equipment e ON mr.equipment_id = e.id
    LEFT JOIN work_centers wc ON mr.work_center_id = wc.id
    LEFT JOIN teams t ON mr.team_id = t.id
    LEFT JOIN users u ON mr.assigned_to_user_id = u.id
    JOIN users c ON mr.created_by_user_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    query += ' AND mr.status = ?';
    params.push(String(status));
  }

  if (type) {
    query += ' AND mr.type = ?';
    params.push(String(type));
  }

  if (team_id) {
    query += ' AND mr.team_id = ?';
    params.push(String(team_id));
  }

  if (assigned_to) {
    query += ' AND mr.assigned_to_user_id = ?';
    params.push(String(assigned_to));
  }

  if (scheduled_date) {
    query += ' AND mr.scheduled_date = ?::date';
    params.push(String(scheduled_date));
  }

  if (equipment_id) {
    query += ' AND mr.equipment_id = ?';
    params.push(String(equipment_id));
  }

  if (work_center_id) {
    query += ' AND mr.work_center_id = ?';
    params.push(String(work_center_id));
  }

  scopeToCaller(req, (clause, value) => {
    query += clause;
    params.push(value);
  });

  query += ' ORDER BY mr.created_at DESC, mr.id DESC';

  const requests = await db.all(query, params);

  res.json({ success: true, data: requests });
}));

// Get requests for calendar view (anything with a scheduled date)
router.get('/calendar', route(async (req, res) => {
  const { start_date, end_date } = req.query;

  let query = `
    SELECT
      mr.*,
      e.name as equipment_name,
      wc.name as work_center_name,
      t.name as team_name,
      u.name as assigned_to_name
    FROM maintenance_requests mr
    LEFT JOIN equipment e ON mr.equipment_id = e.id
    LEFT JOIN work_centers wc ON mr.work_center_id = wc.id
    LEFT JOIN teams t ON mr.team_id = t.id
    LEFT JOIN users u ON mr.assigned_to_user_id = u.id
    WHERE mr.scheduled_date IS NOT NULL
  `;
  const params = [];

  if (start_date) {
    query += ' AND mr.scheduled_date >= ?::date';
    params.push(String(start_date));
  }

  if (end_date) {
    query += ' AND mr.scheduled_date <= ?::date';
    params.push(String(end_date));
  }

  scopeToCaller(req, (clause, value) => {
    query += clause;
    params.push(value);
  });

  query += ' ORDER BY mr.scheduled_date ASC, mr.id ASC';

  const requests = await db.all(query, params);

  res.json({ success: true, data: requests });
}));

// Get single maintenance request by ID
router.get('/:id', route(async (req, res) => {
  const id = toId(req.params.id);
  if (!id) throw notFound('Maintenance request not found');

  const request = await db.get(`
    SELECT
      mr.*,
      e.name as equipment_name,
      e.serial_number,
      e.department,
      e.assigned_employee_name,
      wc.name as work_center_name,
      t.name as team_name,
      u.name as assigned_to_name,
      u.email as assigned_to_email,
      c.name as created_by_name,
      c.email as created_by_email
    FROM maintenance_requests mr
    LEFT JOIN equipment e ON mr.equipment_id = e.id
    LEFT JOIN work_centers wc ON mr.work_center_id = wc.id
    LEFT JOIN teams t ON mr.team_id = t.id
    LEFT JOIN users u ON mr.assigned_to_user_id = u.id
    JOIN users c ON mr.created_by_user_id = c.id
    WHERE mr.id = ?
  `, [id]);

  if (!request) throw notFound('Maintenance request not found');
  if (!canAccess(req, request)) throw forbidden('You do not have access to this request');

  // Get notes for this request. Notes written before authorship was recorded
  // report a null author rather than being attributed to anyone.
  const notes = await db.all(`
    SELECT n.*, u.name AS created_by_name
    FROM notes n
    LEFT JOIN users u ON u.id = n.created_by_user_id
    WHERE n.request_id = ?
    ORDER BY n.created_at DESC, n.id DESC
  `, [id]);

  res.json({
    success: true,
    data: { ...request, notes }
  });
}));

// Create new maintenance request
// Flow: Auto-fill team_id from equipment when equipment is selected
router.post('/', route(async (req, res) => {
  const body = req.body || {};

  const equipmentId = optionalId(body.equipment_id, 'Equipment') || null;
  const workCenterId = optionalId(body.work_center_id, 'Work center') || null;

  if (!body.type || !body.subject || (!equipmentId && !workCenterId)
      || (equipmentId && workCenterId)) {
    throw badRequest('Type, subject, and exactly one of equipment or work center are required');
  }

  const type = requiredEnum(body.type, 'Type', TYPES);
  const subject = requiredString(body.subject, 'Subject', LIMITS.subject);
  // Ownership comes from the session, never the body: a client must not be
  // able to raise a request in someone else's name.
  const createdBy = req.user.id;
  const scheduledDate = optionalDate(body.scheduled_date, 'Scheduled date') ?? null;
  // Only managers and admins may choose the team; for everyone else it is
  // derived from the equipment.
  const requestedTeamId = ['manager', 'admin'].includes(req.user.role)
    ? optionalId(body.team_id, 'Maintenance team') || null
    : null;

  // Validate scheduled_date for preventive maintenance
  if (type === 'preventive' && !scheduledDate) {
    throw badRequest('Scheduled date is required for preventive maintenance');
  }

  let resolvedTeamId = requestedTeamId;
  let equipmentName = null;
  let workCenterName = null;

  if (equipmentId) {
    const equipment = await db.get('SELECT id, maintenance_team_id, name FROM equipment WHERE id = ?', [equipmentId]);
    if (!equipment) throw notFound('Equipment not found');
    equipmentName = equipment.name;
    // Auto-fill team if not provided
    resolvedTeamId = resolvedTeamId || equipment.maintenance_team_id || null;
  }

  if (workCenterId) {
    const wc = await db.get('SELECT id, name FROM work_centers WHERE id = ?', [workCenterId]);
    if (!wc) throw notFound('Work center not found');
    workCenterName = wc.name;
  }

  // A team supplied by the client must exist, or the row would carry a
  // reference that no join can resolve.
  if (requestedTeamId) await assertTeamExists(requestedTeamId);

  const created = await db.insert(`
    INSERT INTO maintenance_requests (
      type, subject, equipment_id, work_center_id, team_id, scheduled_date,
      status, created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    type, subject, equipmentId, workCenterId, resolvedTeamId, scheduledDate,
    'new', // Default status
    createdBy
  ]);

  await audit(req.user.id, 'maintenance.create', 'maintenance_request', created.id);

  res.status(201).json({
    success: true,
    message: 'Maintenance request created successfully',
    data: {
      id: created.id,
      team_id: resolvedTeamId,
      equipment_name: equipmentName,
      work_center_name: workCenterName
    }
  });
}));

// Assign request to a technician (manager or technician can assign themselves)
router.patch('/:id/assign', route(async (req, res) => {
  const request = await findRequest(req.params.id);
  const userId = requiredId((req.body || {}).user_id, 'User ID');

  // Closed work is a historical record; reassigning it would rewrite history.
  if (CLOSED_STATUSES.includes(request.status)) {
    throw badRequest(`Cannot reassign a request that is already ${request.status}`);
  }

  if (!['manager', 'admin', 'technician'].includes(req.user.role)) {
    throw forbidden('You do not have permission to assign requests');
  }
  // A technician may claim unassigned work for themselves, and nothing else.
  if (req.user.role === 'technician'
      && (Number(userId) !== Number(req.user.id)
        || (request.assigned_to_user_id && Number(request.assigned_to_user_id) !== Number(req.user.id)))) {
    throw forbidden('Technicians may only assign an unassigned request to themselves');
  }

  // Check if user exists and has appropriate role
  const user = await db.get('SELECT id, role FROM users WHERE id = ?', [userId]);
  if (!user) throw notFound('User not found');

  if (!['manager', 'technician'].includes(user.role)) {
    throw forbidden('Only managers or technicians can be assigned to requests');
  }

  // Verify user is a member of the request's team (if team is assigned)
  if (request.team_id) {
    const isMember = await db.get('SELECT id FROM team_members WHERE team_id = ? AND user_id = ?', [request.team_id, userId]);

    if (!isMember && user.role !== 'manager') {
      throw forbidden('User must be a member of the assigned team');
    }
  }

  await db.run(`
    UPDATE maintenance_requests
    SET assigned_to_user_id = ?, updated_at = now()
    WHERE id = ?
  `, [userId, request.id]);

  await audit(req.user.id, 'maintenance.assign', 'maintenance_request', request.id, {
    assigned_to_user_id: Number(userId)
  });

  res.json({
    success: true,
    message: 'Request assigned successfully'
  });
}));

// Update request status (new -> in_progress -> repaired/scrap)
router.patch('/:id/status', route(async (req, res) => {
  const body = req.body || {};

  if (body.status === undefined || body.status === null || body.status === '') {
    throw badRequest('Status is required');
  }
  const status = requiredEnum(body.status, 'Status', STATUSES);
  const durationHours = optionalNumber(body.duration_hours, 'Duration (hours)', {
    min: 0,
    max: MAX_DURATION_HOURS
  });

  const request = await findRequest(req.params.id);

  if (!['manager', 'admin'].includes(req.user.role)
      && !(req.user.role === 'technician' && Number(request.assigned_to_user_id) === Number(req.user.id))) {
    throw forbidden('Only the assigned technician or a manager may update status');
  }

  const allowed = VALID_TRANSITIONS[request.status] || [];
  if (!allowed.includes(status)) {
    throw badRequest(`Cannot change status from ${request.status} to ${status}`);
  }

  // Guard the transition in SQL as well, so two concurrent requests cannot both
  // move the same record out of the same starting state.
  const updated = await db.run(`
    UPDATE maintenance_requests
    SET status = ?,
        duration_hours = COALESCE(?, duration_hours),
        updated_at = now()
    WHERE id = ? AND status = ?
  `, [status, durationHours ?? null, request.id, request.status]);

  if (updated.changes !== 1) {
    throw badRequest('The request status changed while this update was in flight');
  }

  await audit(req.user.id, 'maintenance.status', 'maintenance_request', request.id, {
    from: request.status,
    to: status
  });

  res.json({
    success: true,
    message: 'Request status updated successfully'
  });
}));

// Add note to request (for scrap logging or general comments)
router.post('/:id/notes', route(async (req, res) => {
  const message = requiredString((req.body || {}).message, 'Note message', LIMITS.note);
  const request = await findRequest(req.params.id);

  if (!canAccess(req, request)) throw forbidden('You do not have access to this request');

  // Authorship comes from the session, never the body - the same rule the
  // request creator follows.
  const created = await db.insert('INSERT INTO notes (request_id, message, created_by_user_id) VALUES (?, ?, ?)', [request.id, message, req.user.id]);

  await audit(req.user.id, 'maintenance.note.create', 'maintenance_request', request.id, {
    note_id: Number(created.id)
  });

  res.status(201).json({
    success: true,
    message: 'Note added successfully',
    data: { id: created.id }
  });
}));

// Update maintenance request details.
// Only supplied fields are written; the request keeps its current target unless
// the caller explicitly names a different one.
router.put('/:id', authorize('manager', 'admin'), route(async (req, res) => {
  const body = req.body || {};
  const existing = await findRequest(req.params.id);

  // Don't allow editing completed requests
  if (CLOSED_STATUSES.includes(existing.status)) {
    throw badRequest('Cannot edit completed requests');
  }

  const type = optionalEnum(body.type, 'Type', TYPES);
  const subject = optionalString(body.subject, 'Subject', LIMITS.subject);
  const equipmentId = optionalId(body.equipment_id, 'Equipment');
  const workCenterId = optionalId(body.work_center_id, 'Work center');
  const scheduledDate = optionalDate(body.scheduled_date, 'Scheduled date');
  const durationHours = optionalNumber(body.duration_hours, 'Duration (hours)', {
    min: 0,
    max: MAX_DURATION_HOURS
  });

  if (subject === null) throw badRequest('Subject cannot be blank');

  const updates = {};

  if (type) updates.type = type;
  if (subject) updates.subject = subject;
  if (durationHours !== undefined) updates.duration_hours = durationHours;

  // Switching target: naming one clears the other, but omitting both leaves the
  // existing target untouched.
  if (equipmentId) {
    const equipment = await db.get('SELECT id, maintenance_team_id FROM equipment WHERE id = ?', [equipmentId]);
    if (!equipment) throw notFound('Equipment not found');
    updates.equipment_id = equipmentId;
    updates.work_center_id = null;
    // The equipment's team is a default for a *newly pointed* request only.
    // Re-sending the same equipment (which the edit form does on every save)
    // must not silently discard a team a manager chose by hand.
    const changingEquipment = Number(existing.equipment_id) !== Number(equipmentId);
    if (equipment.maintenance_team_id && (changingEquipment || !existing.team_id)) {
      updates.team_id = equipment.maintenance_team_id;
    }
  } else if (workCenterId) {
    const wc = await db.get('SELECT id FROM work_centers WHERE id = ?', [workCenterId]);
    if (!wc) throw notFound('Work center not found');
    updates.work_center_id = workCenterId;
    updates.equipment_id = null;
  } else if (equipmentId === null && workCenterId === null) {
    throw badRequest('A request must target either equipment or a work center');
  }

  if (scheduledDate !== undefined) {
    const effectiveType = updates.type || existing.type;
    if (effectiveType === 'preventive' && scheduledDate === null) {
      throw badRequest('Scheduled date is required for preventive maintenance');
    }
    updates.scheduled_date = scheduledDate;
  } else if (updates.type === 'preventive' && !existing.scheduled_date) {
    throw badRequest('Scheduled date is required for preventive maintenance');
  }

  const assignments = Object.keys(updates).map((column) => `${column} = ?`);
  assignments.push('updated_at = now()');

  await db.run(`UPDATE maintenance_requests SET ${assignments.join(', ')} WHERE id = ?`, [...Object.values(updates), existing.id]);

  await audit(req.user.id, 'maintenance.update', 'maintenance_request', existing.id, {
    fields: Object.keys(updates)
  });

  res.json({
    success: true,
    message: 'Maintenance request updated successfully'
  });
}));

// Delete maintenance request
router.delete('/:id', authorize('manager', 'admin'), route(async (req, res) => {
  const existing = await findRequest(req.params.id, 'id, subject, status');

  // Notes cascade via the foreign key, but be explicit so the behaviour holds
  // even against a schema where the cascade was not applied.
  await db.tx(async (trx) => {
    await trx.run('DELETE FROM notes WHERE request_id = ?', [existing.id]);
    await trx.run('DELETE FROM maintenance_requests WHERE id = ?', [existing.id]);
  });

  // Recorded after the fact: once the row is gone the audit entry is the only
  // remaining trace of what was removed.
  await audit(req.user.id, 'maintenance.delete', 'maintenance_request', existing.id, {
    subject: existing.subject,
    status: existing.status
  });

  res.json({
    success: true,
    message: 'Maintenance request deleted successfully'
  });
}));

module.exports = router;
