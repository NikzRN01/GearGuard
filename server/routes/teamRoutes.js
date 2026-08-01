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
const { authorize } = require('../middleware/auth');

const router = express.Router();

// Administrators are a super-role: governance access plus every operational
// capability available to managers.
router.use(authorize('user', 'technician', 'manager', 'admin'));

const findTeam = (rawId) => {
  const id = toId(rawId);
  if (!id) throw notFound('Team not found');
  const team = db.prepare('SELECT id, name FROM teams WHERE id = ?').get(id);
  if (!team) throw notFound('Team not found');
  return team;
};

// Get all users (for team member assignment)
router.get('/users/all', authorize('manager', 'admin'), route((req, res) => {
  const users = db.prepare(`
    SELECT
      id,
      name,
      email,
      role
    FROM users
    ORDER BY name
  `).all();

  res.json({ success: true, data: users });
}));

// Get all teams
router.get('/', route((req, res) => {
  const teams = db.prepare(`
    SELECT
      t.id,
      t.name,
      t.created_at,
      COUNT(tm.id) as member_count
    FROM teams t
    LEFT JOIN team_members tm ON t.id = tm.team_id
    GROUP BY t.id
    ORDER BY t.name
  `).all();

  res.json({ success: true, data: teams });
}));

// Get single team with members.
// Requesters ('user') can reach this page to see who looks after an asset, but
// they are outside the maintenance organisation, so they get names and roles
// without the address book. GET /teams/users/all is manager-only for the same
// reason and this endpoint must not become a way around it.
router.get('/:id', route((req, res) => {
  const team = findTeam(req.params.id);
  const showContactDetails = ['technician', 'manager', 'admin'].includes(req.user.role);

  const members = db.prepare(`
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
  `).all(team.id);

  const full = db.prepare('SELECT * FROM teams WHERE id = ?').get(team.id);

  res.json({
    success: true,
    data: { ...full, members }
  });
}));

// Create new team
router.post('/', authorize('manager', 'admin'), route((req, res) => {
  const name = requiredString((req.body || {}).name, 'Team name', LIMITS.name);

  // Check for duplicate team name
  const existing = db.prepare('SELECT id FROM teams WHERE name = ?').get(name);
  if (existing) {
    throw conflict('Team with this name already exists');
  }

  let result;
  try {
    result = db.prepare('INSERT INTO teams (name) VALUES (?)').run(name);
  } catch (error) {
    // Concurrent creates both pass the check above; the UNIQUE index decides.
    if (isUniqueViolation(error)) throw conflict('Team with this name already exists');
    throw error;
  }

  res.status(201).json({
    success: true,
    message: 'Team created successfully',
    data: { id: result.lastInsertRowid }
  });
}));

// Update team
router.put('/:id', authorize('manager', 'admin'), route((req, res) => {
  const team = findTeam(req.params.id);
  const name = requiredString((req.body || {}).name, 'Team name', LIMITS.name);

  // Check for duplicate team name
  const duplicate = db.prepare('SELECT id FROM teams WHERE name = ? AND id != ?').get(name, team.id);
  if (duplicate) {
    throw conflict('Team with this name already exists');
  }

  try {
    db.prepare('UPDATE teams SET name = ? WHERE id = ?').run(name, team.id);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('Team with this name already exists');
    throw error;
  }

  res.json({
    success: true,
    message: 'Team updated successfully'
  });
}));

// Delete team
router.delete('/:id', authorize('manager', 'admin'), route((req, res) => {
  const team = findTeam(req.params.id);

  // Check if team is assigned to any equipment
  const hasEquipment = db
    .prepare('SELECT id FROM equipment WHERE maintenance_team_id = ? LIMIT 1')
    .get(team.id);
  if (hasEquipment) {
    throw badRequest('Cannot delete team assigned to equipment');
  }

  // Maintenance requests reference the team too; deleting would leave them
  // pointing at a row that no longer exists.
  const hasRequests = db
    .prepare('SELECT id FROM maintenance_requests WHERE team_id = ? LIMIT 1')
    .get(team.id);
  if (hasRequests) {
    throw badRequest('Cannot delete team assigned to maintenance requests');
  }

  db.prepare('DELETE FROM teams WHERE id = ?').run(team.id);

  res.json({
    success: true,
    message: 'Team deleted successfully'
  });
}));

// Add member to team
router.post('/:id/members', authorize('manager', 'admin'), route((req, res) => {
  const team = findTeam(req.params.id);
  const userId = requiredId((req.body || {}).user_id, 'User ID');

  // Check if user exists
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId);
  if (!user) throw notFound('User not found');

  // Check if user is already a member
  const existing = db
    .prepare('SELECT id FROM team_members WHERE team_id = ? AND user_id = ?')
    .get(team.id, userId);
  if (existing) {
    throw conflict('User is already a member of this team');
  }

  try {
    db.prepare('INSERT INTO team_members (team_id, user_id) VALUES (?, ?)').run(team.id, userId);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('User is already a member of this team');
    throw error;
  }

  res.status(201).json({
    success: true,
    message: 'Member added to team successfully'
  });
}));

// Remove member from team
router.delete('/:id/members/:userId', authorize('manager', 'admin'), route((req, res) => {
  const teamId = toId(req.params.id);
  const userId = toId(req.params.userId);
  if (!teamId || !userId) throw notFound('Member not found in this team');

  const existing = db
    .prepare('SELECT id FROM team_members WHERE team_id = ? AND user_id = ?')
    .get(teamId, userId);
  if (!existing) {
    throw notFound('Member not found in this team');
  }

  db.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(teamId, userId);

  res.json({
    success: true,
    message: 'Member removed from team successfully'
  });
}));

// Get available users (eligible users who are not already in this team)
router.get('/:id/available-users', authorize('manager', 'admin'), route((req, res) => {
  const team = findTeam(req.params.id);

  const users = db.prepare(`
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
  `).all(team.id);

  res.json({ success: true, data: users });
}));

module.exports = router;
