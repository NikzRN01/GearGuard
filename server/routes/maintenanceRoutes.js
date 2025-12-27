const express = require('express');
const db = require('../database');

const router = express.Router();

// Get all maintenance requests
router.get('/', (req, res) => {
  try {
    const { status, type, team_id, assigned_to, scheduled_date } = req.query;
    
    let query = `
      SELECT 
        mr.*,
        e.name as equipment_name,
        e.serial_number,
        e.department,
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
      params.push(status);
    }
    
    if (type) {
      query += ' AND mr.type = ?';
      params.push(type);
    }
    
    if (team_id) {
      query += ' AND mr.team_id = ?';
      params.push(team_id);
    }
    
    if (assigned_to) {
      query += ' AND mr.assigned_to_user_id = ?';
      params.push(assigned_to);
    }
    
    if (scheduled_date) {
      query += ' AND DATE(mr.scheduled_date) = DATE(?)';
      params.push(scheduled_date);
    }
    
    query += ' ORDER BY mr.created_at DESC';
    
    const requests = db.prepare(query).all(...params);
    
    res.json({ success: true, data: requests });
  } catch (error) {
    console.error('Get maintenance requests error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get requests for calendar view (preventive maintenance with scheduled dates)
router.get('/calendar', (req, res) => {
  try {
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
      query += ' AND DATE(mr.scheduled_date) >= DATE(?)';
      params.push(start_date);
    }
    
    if (end_date) {
      query += ' AND DATE(mr.scheduled_date) <= DATE(?)';
      params.push(end_date);
    }
    
    query += ' ORDER BY mr.scheduled_date ASC';
    
    const requests = db.prepare(query).all(...params);
    
    res.json({ success: true, data: requests });
  } catch (error) {
    console.error('Get calendar requests error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get single maintenance request by ID
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    const request = db.prepare(`
      SELECT 
        mr.*,
        e.name as equipment_name,
        e.serial_number,
        e.department,
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
    `).get(id);
    
    if (!request) {
      return res.status(404).json({ success: false, message: 'Maintenance request not found' });
    }
    
    // Get notes for this request
    const notes = db.prepare(`
      SELECT * FROM notes 
      WHERE request_id = ? 
      ORDER BY created_at DESC
    `).all(id);
    
    res.json({ 
      success: true, 
      data: { ...request, notes }
    });
  } catch (error) {
    console.error('Get maintenance request error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Create new maintenance request
// Flow: Auto-fill team_id from equipment when equipment is selected
router.post('/', (req, res) => {
  try {
    const {
      type,
      subject,
      equipment_id,
      work_center_id,
      team_id,
      scheduled_date,
      created_by_user_id
    } = req.body;
    
    // Validate required fields
    if (!type || !subject || (!equipment_id && !work_center_id) || (equipment_id && work_center_id) || !created_by_user_id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Type, subject, creator, and exactly one of equipment or work center are required' 
      });
    }
    
    // Validate type
    if (!['corrective', 'preventive'].includes(type)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Type must be either "corrective" or "preventive"' 
      });
    }
    
    // Validate scheduled_date for preventive maintenance
    if (type === 'preventive' && !scheduled_date) {
      return res.status(400).json({ 
        success: false, 
        message: 'Scheduled date is required for preventive maintenance' 
      });
    }
    
    let resolvedTeamId = team_id || null;
    let equipmentName = null;
    let workCenterName = null;

    if (equipment_id) {
      const equipment = db.prepare('SELECT id, maintenance_team_id, name FROM equipment WHERE id = ?').get(equipment_id);
      if (!equipment) {
        return res.status(404).json({ success: false, message: 'Equipment not found' });
      }
      equipmentName = equipment.name;
      // Auto-fill team if not provided
      resolvedTeamId = resolvedTeamId || equipment.maintenance_team_id || null;
    }

    if (work_center_id) {
      const wc = db.prepare('SELECT id, name FROM work_centers WHERE id = ?').get(work_center_id);
      if (!wc) {
        return res.status(404).json({ success: false, message: 'Work center not found' });
      }
      workCenterName = wc.name;
    }
    
    // Check if user exists
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(created_by_user_id);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    const stmt = db.prepare(`
      INSERT INTO maintenance_requests (
        type, subject, equipment_id, work_center_id, team_id, scheduled_date, 
        status, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      type,
      subject,
      equipment_id || null,
      work_center_id || null,
      resolvedTeamId,
      scheduled_date || null,
      'new', // Default status
      created_by_user_id
    );
    
    res.status(201).json({ 
      success: true, 
      message: 'Maintenance request created successfully',
      data: { id: result.lastInsertRowid, team_id: resolvedTeamId, equipment_name: equipmentName, work_center_name: workCenterName }
    });
  } catch (error) {
    console.error('Create maintenance request error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Assign request to a technician (manager or technician can assign themselves)
router.patch('/:id/assign', (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;
    
    if (!user_id) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID is required' 
      });
    }
    
    // Check if request exists
    const request = db.prepare('SELECT id, team_id, status FROM maintenance_requests WHERE id = ?').get(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Maintenance request not found' });
    }
    
    // Check if user exists and has appropriate role
    const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(user_id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    if (!['manager', 'technician'].includes(user.role)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only managers or technicians can be assigned to requests' 
      });
    }
    
    // Verify user is a member of the request's team (if team is assigned)
    if (request.team_id) {
      const isMember = db.prepare('SELECT id FROM team_members WHERE team_id = ? AND user_id = ?')
        .get(request.team_id, user_id);
      
      if (!isMember && user.role !== 'manager') {
        return res.status(403).json({ 
          success: false, 
          message: 'User must be a member of the assigned team' 
        });
      }
    }
    
    // Update request
    db.prepare(`
      UPDATE maintenance_requests 
      SET assigned_to_user_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(user_id, id);
    
    res.json({ 
      success: true, 
      message: 'Request assigned successfully'
    });
  } catch (error) {
    console.error('Assign request error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Update request status (new -> in_progress -> repaired/scrap)
router.patch('/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status, duration_hours } = req.body;
    
    if (!status) {
      return res.status(400).json({ 
        success: false, 
        message: 'Status is required' 
      });
    }
    
    // Validate status
    if (!['new', 'in_progress', 'repaired', 'scrap'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid status. Must be: new, in_progress, repaired, or scrap' 
      });
    }
    
    // Check if request exists
    const request = db.prepare('SELECT id, status FROM maintenance_requests WHERE id = ?').get(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Maintenance request not found' });
    }
    
    // Validate status transition
    const validTransitions = {
      'new': ['in_progress', 'scrap'],
      'in_progress': ['repaired', 'scrap'],
      'repaired': [],
      'scrap': []
    };
    
    if (!validTransitions[request.status].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot change status from ${request.status} to ${status}` 
      });
    }
    
    // Update request
    const stmt = db.prepare(`
      UPDATE maintenance_requests 
      SET status = ?, 
          duration_hours = COALESCE(?, duration_hours),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    stmt.run(status, duration_hours, id);
    
    res.json({ 
      success: true, 
      message: 'Request status updated successfully'
    });
  } catch (error) {
    console.error('Update request status error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Add note to request (for scrap logging or general comments)
router.post('/:id/notes', (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ 
        success: false, 
        message: 'Note message is required' 
      });
    }
    
    // Check if request exists
    const request = db.prepare('SELECT id FROM maintenance_requests WHERE id = ?').get(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Maintenance request not found' });
    }
    
    const stmt = db.prepare('INSERT INTO notes (request_id, message) VALUES (?, ?)');
    const result = stmt.run(id, message);
    
    res.status(201).json({ 
      success: true, 
      message: 'Note added successfully',
      data: { id: result.lastInsertRowid }
    });
  } catch (error) {
    console.error('Add note error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Update maintenance request details
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const {
      type,
      subject,
      equipment_id,
      work_center_id,
      scheduled_date,
      duration_hours
    } = req.body;
    
    // Check if request exists
    const existing = db.prepare('SELECT id, status FROM maintenance_requests WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Maintenance request not found' });
    }
    
    // Don't allow editing completed requests
    if (['repaired', 'scrap'].includes(existing.status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot edit completed requests' 
      });
    }
    
    // If equipment is being changed, auto-fill team_id and clear work_center_id
    let team_id = null;
    let newEquipmentId = equipment_id || null;
    let newWorkCenterId = work_center_id || null;

    if (equipment_id) {
      const equipment = db.prepare('SELECT maintenance_team_id FROM equipment WHERE id = ?').get(equipment_id);
      if (!equipment) {
        return res.status(404).json({ success: false, message: 'Equipment not found' });
      }
      team_id = equipment.maintenance_team_id;
      newWorkCenterId = null; // switch target
    }
    // If work center is being changed, clear equipment_id
    if (work_center_id) {
      const wc = db.prepare('SELECT id FROM work_centers WHERE id = ?').get(work_center_id);
      if (!wc) {
        return res.status(404).json({ success: false, message: 'Work center not found' });
      }
      newEquipmentId = null; // switch target
    }
    
    // Validate type if provided
    if (type && !['corrective', 'preventive'].includes(type)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Type must be either "corrective" or "preventive"' 
      });
    }
    
    const stmt = db.prepare(`
      UPDATE maintenance_requests SET
        type = COALESCE(?, type),
        subject = COALESCE(?, subject),
        equipment_id = ?,
        work_center_id = ?,
        team_id = COALESCE(?, team_id),
        scheduled_date = ?,
        duration_hours = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    stmt.run(
      type,
      subject,
      newEquipmentId,
      newWorkCenterId,
      team_id,
      scheduled_date,
      duration_hours,
      id
    );
    
    res.json({ 
      success: true, 
      message: 'Maintenance request updated successfully'
    });
  } catch (error) {
    console.error('Update maintenance request error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Delete maintenance request
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if request exists
    const existing = db.prepare('SELECT id FROM maintenance_requests WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Maintenance request not found' });
    }
    
    db.prepare('DELETE FROM maintenance_requests WHERE id = ?').run(id);
    
    res.json({ 
      success: true, 
      message: 'Maintenance request deleted successfully'
    });
  } catch (error) {
    console.error('Delete maintenance request error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
