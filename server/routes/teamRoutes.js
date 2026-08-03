const express = require('express');
const db = require('../database');
const {
  LIMITS,
  badRequest,
  notFound,
  conflict,
  requiredString,
  requiredId,
  toId,
  route,
  isUniqueViolation
} = require('../lib/validation');
const { authorize, audit } = require('../middleware/auth');

const router = express.Router();

// Administrators are a super-role: governance access plus every operational
// capability available to managers.
router.use(authorize('user', 'technician', 'manager', 'admin'));

const findTeam = async (rawId) => {
  const id = toId(rawId);
  if (!id) throw notFound('Team not found');
  const team = await db.get('SELECT id, name FROM teams WHERE id = ?', [id]);
  if (!team) throw notFound('Team not found');
  return team;
};

// Get all users (for team member assignment)
router.get('/users/all', authorize('manager', 'admin'), route(async (req, res) => {
  const users = await db.all(`
    SELECT
      id,
      name,
      email,
      role
    FROM users
    ORDER BY name
  `);

  res.json({ success: true, data: users });
}));

// Get all teams
router.get('/', route(async (req, res) => {
  const teams = await db.all(`
    SELECT
      t.id,
      t.name,
      t.created_at,
      COUNT(tm.id) as member_count
    FROM teams t
    LEFT JOIN team_members tm ON t.id = tm.team_id
    GROUP BY t.id
    ORDER BY t.name
  `);

  res.json({ success: true, data: teams });
}));

// Get single team with members.
// Requesters ('user') can reach this page to see who looks after an asset, but
// they are outside the maintenance organisation, so they get names and roles
// without the address book. GET /teams/users/all is manager-only for the same
// reason and this endpoint must not become a way around it.
router.get('/:id', route(async (req, res) => {
  const team = await findTeam(req.params.id);
  const showContactDetails = ['technician', 'manager', 'admin'].includes(req.user.role);

  const members = await db.all(`
    SELECT
      u.id,
      u.name,
      ${showContactDetails ? 'u.email' : 'NULL as email'},
      u.role,
      tm.created_at as joined_at
    FROM team_members tm
    JOIN users u ON tm.user_id = u.id
    WHERE tm.team_id = ?
    ORDER BY u.name
  `, [team.id]);

  const full = await db.get('SELECT * FROM teams WHERE id = ?', [team.id]);

  res.json({
    success: true,
    data: { ...full, members }
  });
}));

// Create new team
router.post('/', authorize('manager', 'admin'), route(async (req, res) => {
  const name = requiredString((req.body || {}).name, 'Team name', LIMITS.name);

  // Check for duplicate team name
  const existing = await db.get('SELECT id FROM teams WHERE name = ?', [name]);
  if (existing) {
    throw conflict('Team with this name already exists');
  }

  let created;
  try {
    created = await db.insert('INSERT INTO teams (name) VALUES (?)', [name]);
  } catch (error) {
    // Concurrent creates both pass the check above; the UNIQUE index decides.
    if (isUniqueViolation(error)) throw conflict('Team with this name already exists');
    throw error;
  }

  await audit(req.user.id, 'team.create', 'team', created.id, { name });

  res.status(201).json({
    success: true,
    message: 'Team created successfully',
    data: { id: created.id }
  });
}));

// Update team
router.put('/:id', authorize('manager', 'admin'), route(async (req, res) => {
  const team = await findTeam(req.params.id);
  const name = requiredString((req.body || {}).name, 'Team name', LIMITS.name);

  // Check for duplicate team name
  const duplicate = await db.get('SELECT id FROM teams WHERE name = ? AND id != ?', [name, team.id]);
  if (duplicate) {
    throw conflict('Team with this name already exists');
  }

  try {
    await db.run('UPDATE teams SET name = ? WHERE id = ?', [name, team.id]);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('Team with this name already exists');
    throw error;
  }

  if (team.name !== name) {
    await audit(req.user.id, 'team.update', 'team', team.id, { name: { from: team.name, to: name } });
  }

  res.json({
    success: true,
    message: 'Team updated successfully'
  });
}));

// Delete team
router.delete('/:id', authorize('manager', 'admin'), route(async (req, res) => {
  const team = await findTeam(req.params.id);

  // Check if team is assigned to any equipment
  const hasEquipment = await db.get('SELECT id FROM equipment WHERE maintenance_team_id = ? LIMIT 1', [team.id]);
  if (hasEquipment) {
    throw badRequest('Cannot delete team assigned to equipment');
  }

  // Maintenance requests reference the team too; deleting would leave them
  // pointing at a row that no longer exists.
  const hasRequests = await db.get('SELECT id FROM maintenance_requests WHERE team_id = ? LIMIT 1', [team.id]);
  if (hasRequests) {
    throw badRequest('Cannot delete team assigned to maintenance requests');
  }

  await db.run('DELETE FROM teams WHERE id = ?', [team.id]);

  // Recorded after the fact: the audit entry is the only remaining trace.
  await audit(req.user.id, 'team.delete', 'team', team.id, { name: team.name });

  res.json({
    success: true,
    message: 'Team deleted successfully'
  });
}));

// Add member to team
router.post('/:id/members', authorize('manager', 'admin'), route(async (req, res) => {
  const team = await findTeam(req.params.id);
  const userId = requiredId((req.body || {}).user_id, 'User ID');

  // Check if user exists
  const user = await db.get('SELECT id, role FROM users WHERE id = ?', [userId]);
  if (!user) throw notFound('User not found');

  // Check if user is already a member
  const existing = await db.get('SELECT id FROM team_members WHERE team_id = ? AND user_id = ?', [team.id, userId]);
  if (existing) {
    throw conflict('User is already a member of this team');
  }

  try {
    await db.run('INSERT INTO team_members (team_id, user_id) VALUES (?, ?)', [team.id, userId]);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('User is already a member of this team');
    throw error;
  }

  // Team membership decides who a request can be assigned to, so joining a team
  // is an access change and belongs in the trail.
  await audit(req.user.id, 'team.member.add', 'team', team.id, {
    user_id: Number(userId),
    role: user.role
  });

  res.status(201).json({
    success: true,
    message: 'Member added to team successfully'
  });
}));

// Remove member from team
router.delete('/:id/members/:userId', authorize('manager', 'admin'), route(async (req, res) => {
  const teamId = toId(req.params.id);
  const userId = toId(req.params.userId);
  if (!teamId || !userId) throw notFound('Member not found in this team');

  const existing = await db.get('SELECT id FROM team_members WHERE team_id = ? AND user_id = ?', [teamId, userId]);
  if (!existing) {
    throw notFound('Member not found in this team');
  }

  await db.run('DELETE FROM team_members WHERE team_id = ? AND user_id = ?', [teamId, userId]);

  await audit(req.user.id, 'team.member.remove', 'team', teamId, { user_id: userId });

  res.json({
    success: true,
    message: 'Member removed from team successfully'
  });
}));

// Get available users (eligible users who are not already in this team)
router.get('/:id/available-users', authorize('manager', 'admin'), route(async (req, res) => {
  const team = await findTeam(req.params.id);

  const users = await db.all(`
    SELECT
      u.id,
      u.name,
      u.email,
      u.role
    FROM users u
    WHERE u.id NOT IN (
      SELECT user_id FROM team_members WHERE team_id = ?
    )
    AND u.role IN ('technician', 'manager')
    ORDER BY u.name
  `, [team.id]);

  res.json({ success: true, data: users });
}));

module.exports = router;
