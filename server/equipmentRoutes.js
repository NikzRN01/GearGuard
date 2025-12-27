const express = require('express');
const db = require('./database');

const router = express.Router();

// Get all equipment
router.get('/', (req, res) => {
  try {
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
      params.push(department);
    }
    
    if (employee) {
      query += ' AND e.assigned_employee_name = ?';
      params.push(employee);
    }
    
    if (status) {
      query += ' AND e.status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY e.created_at DESC';
    
    const equipment = db.prepare(query).all(...params);
    
    res.json({ success: true, data: equipment });
  } catch (error) {
    console.error('Get equipment error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get single equipment by ID
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    const equipment = db.prepare(`
      SELECT 
        e.*,
        t.name as team_name
      FROM equipment e
      LEFT JOIN teams t ON e.maintenance_team_id = t.id
      WHERE e.id = ?
    `).get(id);
    
    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Equipment not found' });
    }
    
    res.json({ success: true, data: equipment });
  } catch (error) {
    console.error('Get equipment error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Create new equipment
router.post('/', (req, res) => {
  try {
    const {
      name,
      serial_number,
      department,
      assigned_employee_name,
      purchase_date,
      warranty_end_date,
      location,
      maintenance_team_id,
      status
    } = req.body;
    
    // Validate required fields
    if (!name || !serial_number) {
      return res.status(400).json({ 
        success: false, 
        message: 'Equipment name and serial number are required' 
      });
    }
    
    // Check for duplicate serial number
    const existing = db.prepare('SELECT id FROM equipment WHERE serial_number = ?').get(serial_number);
    if (existing) {
      return res.status(409).json({ 
        success: false, 
        message: 'Equipment with this serial number already exists' 
      });
    }
    
    // Validate team exists if provided
    if (maintenance_team_id) {
      const team = db.prepare('SELECT id FROM teams WHERE id = ?').get(maintenance_team_id);
      if (!team) {
        return res.status(404).json({ 
          success: false, 
          message: 'Maintenance team not found' 
        });
      }
    }
    
    const stmt = db.prepare(`
      INSERT INTO equipment (
        name, serial_number, department, assigned_employee_name,
        purchase_date, warranty_end_date, location, maintenance_team_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      name,
      serial_number,
      department || null,
      assigned_employee_name || null,
      purchase_date || null,
      warranty_end_date || null,
      location || null,
      maintenance_team_id || null,
      status || 'active'
    );
    
    res.status(201).json({ 
      success: true, 
      message: 'Equipment created successfully',
      data: { id: result.lastInsertRowid }
    });
  } catch (error) {
    console.error('Create equipment error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Update equipment
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      serial_number,
      department,
      assigned_employee_name,
      purchase_date,
      warranty_end_date,
      location,
      maintenance_team_id,
      status
    } = req.body;
    
    // Check if equipment exists
    const existing = db.prepare('SELECT id FROM equipment WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Equipment not found' });
    }
    
    // Check for duplicate serial number (excluding current equipment)
    if (serial_number) {
      const duplicate = db.prepare('SELECT id FROM equipment WHERE serial_number = ? AND id != ?').get(serial_number, id);
      if (duplicate) {
        return res.status(409).json({ 
          success: false, 
          message: 'Equipment with this serial number already exists' 
        });
      }
    }
    
    // Validate team exists if provided
    if (maintenance_team_id) {
      const team = db.prepare('SELECT id FROM teams WHERE id = ?').get(maintenance_team_id);
      if (!team) {
        return res.status(404).json({ 
          success: false, 
          message: 'Maintenance team not found' 
        });
      }
    }
    
    const stmt = db.prepare(`
      UPDATE equipment SET
        name = COALESCE(?, name),
        serial_number = COALESCE(?, serial_number),
        department = ?,
        assigned_employee_name = ?,
        purchase_date = ?,
        warranty_end_date = ?,
        location = ?,
        maintenance_team_id = ?,
        status = COALESCE(?, status)
      WHERE id = ?
    `);
    
    stmt.run(
      name,
      serial_number,
      department,
      assigned_employee_name,
      purchase_date,
      warranty_end_date,
      location,
      maintenance_team_id,
      status,
      id
    );
    
    res.json({ 
      success: true, 
      message: 'Equipment updated successfully'
    });
  } catch (error) {
    console.error('Update equipment error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Delete equipment
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if equipment exists
    const existing = db.prepare('SELECT id FROM equipment WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Equipment not found' });
    }
    
    // Check if equipment has maintenance requests
    const hasRequests = db.prepare('SELECT id FROM maintenance_requests WHERE equipment_id = ? LIMIT 1').get(id);
    if (hasRequests) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete equipment with existing maintenance requests' 
      });
    }
    
    db.prepare('DELETE FROM equipment WHERE id = ?').run(id);
    
    res.json({ 
      success: true, 
      message: 'Equipment deleted successfully'
    });
  } catch (error) {
    console.error('Delete equipment error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
