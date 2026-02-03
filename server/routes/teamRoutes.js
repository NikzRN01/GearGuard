const express = require('express');
const db = require('../database');

const router = express.Router();

// Get all users (for team member assignment)
router.get('/users/all', (req, res) => {
  try {
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
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get all teams
router.get('/', (req, res) => {
  try {
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
  } catch (error) {
    console.error('Get teams error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get single team with members
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(id);
    
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }
    
    const members = db.prepare(`
      SELECT 
        u.id,
        u.name,
        u.email,
        u.role,
        tm.created_at as joined_at
      FROM team_members tm
      JOIN users u ON tm.user_id = u.id
      WHERE tm.team_id = ?
      ORDER BY u.name
    `).all(id);
    
    res.json({ 
      success: true, 
      data: { ...team, members }
    });
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Create new team
router.post('/', (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ 
        success: false, 
        message: 'Team name is required' 
      });
    }
    
    // Check for duplicate team name
    const existing = db.prepare('SELECT id FROM teams WHERE name = ?').get(name);
    if (existing) {
      return res.status(409).json({ 
        success: false, 
        message: 'Team with this name already exists' 
      });
    }
    
    const stmt = db.prepare('INSERT INTO teams (name) VALUES (?)');
    const result = stmt.run(name);
    
    res.status(201).json({ 
      success: true, 
      message: 'Team created successfully',
      data: { id: result.lastInsertRowid }
    });
  } catch (error) {
    console.error('Create team error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Update team
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ 
        success: false, 
        message: 'Team name is required' 
      });
    }
    
    // Check if team exists
    const existing = db.prepare('SELECT id FROM teams WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }
    
    // Check for duplicate team name
    const duplicate = db.prepare('SELECT id FROM teams WHERE name = ? AND id != ?').get(name, id);
    if (duplicate) {
      return res.status(409).json({ 
        success: false, 
        message: 'Team with this name already exists' 
      });
    }
    
    db.prepare('UPDATE teams SET name = ? WHERE id = ?').run(name, id);
    
    res.json({ 
      success: true, 
      message: 'Team updated successfully'
    });
  } catch (error) {
    console.error('Update team error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Delete team
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if team exists
    const existing = db.prepare('SELECT id FROM teams WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }
    
    // Check if team is assigned to any equipment
    const hasEquipment = db.prepare('SELECT id FROM equipment WHERE maintenance_team_id = ? LIMIT 1').get(id);
    if (hasEquipment) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete team assigned to equipment' 
      });
    }
    
    db.prepare('DELETE FROM teams WHERE id = ?').run(id);
    
    res.json({ 
      success: true, 
      message: 'Team deleted successfully'
    });
  } catch (error) {
    console.error('Delete team error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Add member to team
router.post('/:id/members', (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;
    
    if (!user_id) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID is required' 
      });
    }
    
    // Check if team exists
    const team = db.prepare('SELECT id FROM teams WHERE id = ?').get(id);
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }
    
    // Check if user exists
    const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(user_id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Check if user is already a member
    const existing = db.prepare('SELECT id FROM team_members WHERE team_id = ? AND user_id = ?').get(id, user_id);
    if (existing) {
      return res.status(409).json({ 
        success: false, 
        message: 'User is already a member of this team' 
      });
    }
    
    const stmt = db.prepare('INSERT INTO team_members (team_id, user_id) VALUES (?, ?)');
    stmt.run(id, user_id);
    
    res.status(201).json({ 
      success: true, 
      message: 'Member added to team successfully'
    });
  } catch (error) {
    console.error('Add team member error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Remove member from team
router.delete('/:id/members/:userId', (req, res) => {
  try {
    const { id, userId } = req.params;
    
    // Check if membership exists
    const existing = db.prepare('SELECT id FROM team_members WHERE team_id = ? AND user_id = ?').get(id, userId);
    if (!existing) {
      return res.status(404).json({ 
        success: false, 
        message: 'Member not found in this team' 
      });
    }
    
    db.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(id, userId);
    
    res.json({ 
      success: true, 
      message: 'Member removed from team successfully'
    });
  } catch (error) {
    console.error('Remove team member error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get available users (not in a specific team or all users)
router.get('/:id/available-users', (req, res) => {
  try {
    const { id } = req.params;
    
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
    `).all(id);
    
    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Get available users error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
