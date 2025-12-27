
const express = require('express');
const db = require('../database');

const router = express.Router();

// List work centers with optional filters
router.get('/', (req, res) => {
  try {
    const { status, search } = req.query;
    let query = `
      SELECT wc.* FROM work_centers wc
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND wc.status = ?';
      params.push(status);
    }
    if (search) {
      query += ' AND (wc.name LIKE ? OR wc.code LIKE ? OR wc.tag LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    query += ' ORDER BY wc.name';

    const data = db.prepare(query).all(...params);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Get work centers error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get single work center with alternatives
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const wc = db.prepare('SELECT * FROM work_centers WHERE id = ?').get(id);
    if (!wc) {
      return res.status(404).json({ success: false, message: 'Work center not found' });
    }
    const alternatives = db.prepare(`
      SELECT wca.id, wca.alternative_work_center_id as alt_id, wc2.name as alt_name
      FROM work_center_alternatives wca
      JOIN work_centers wc2 ON wc2.id = wca.alternative_work_center_id
      WHERE wca.work_center_id = ?
      ORDER BY wc2.name
    `).all(id);
    res.json({ success: true, data: { ...wc, alternatives } });
  } catch (error) {
    console.error('Get work center error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Create work center
router.post('/', (req, res) => {
  try {
    const {
      name,
      code,
      tag,
      cost_per_hour,
      capacity_per_hour,
      time_efficiency_pct,
      oee_target_pct,
      status
    } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    const dup = db.prepare('SELECT id FROM work_centers WHERE name = ?').get(name);
    if (dup) {
      return res.status(409).json({ success: false, message: 'Work center with this name already exists' });
    }

    const stmt = db.prepare(`
      INSERT INTO work_centers (
        name, code, tag, cost_per_hour, capacity_per_hour,
        time_efficiency_pct, oee_target_pct, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      name,
      code || null,
      tag || null,
      cost_per_hour ?? 0,
      capacity_per_hour ?? 0,
      time_efficiency_pct ?? 100,
      oee_target_pct ?? 0,
      status || 'active'
    );
    res.status(201).json({ success: true, message: 'Work center created', data: { id: result.lastInsertRowid } });
  } catch (error) {
    console.error('Create work center error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Update work center
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT id FROM work_centers WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Work center not found' });
    }

    const {
      name,
      code,
      tag,
      cost_per_hour,
      capacity_per_hour,
      time_efficiency_pct,
      oee_target_pct,
      status
    } = req.body;

    const stmt = db.prepare(`
      UPDATE work_centers SET
        name = COALESCE(?, name),
        code = COALESCE(?, code),
        tag = COALESCE(?, tag),
        cost_per_hour = COALESCE(?, cost_per_hour),
        capacity_per_hour = COALESCE(?, capacity_per_hour),
        time_efficiency_pct = COALESCE(?, time_efficiency_pct),
        oee_target_pct = COALESCE(?, oee_target_pct),
        status = COALESCE(?, status)
      WHERE id = ?
    `);
    stmt.run(
      name,
      code,
      tag,
      cost_per_hour,
      capacity_per_hour,
      time_efficiency_pct,
      oee_target_pct,
      status,
      id
    );

    res.json({ success: true, message: 'Work center updated' });
  } catch (error) {
    console.error('Update work center error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Soft delete (deactivate) work center
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT id FROM work_centers WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Work center not found' });
    }
    db.prepare('UPDATE work_centers SET status = "inactive" WHERE id = ?').run(id);
    res.json({ success: true, message: 'Work center deactivated' });
  } catch (error) {
    console.error('Delete work center error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Alternatives
router.get('/:id/alternatives', (req, res) => {
  try {
    const { id } = req.params;
    const rows = db.prepare(`
      SELECT wca.id, wca.alternative_work_center_id as alt_id, wc2.name as alt_name
      FROM work_center_alternatives wca
      JOIN work_centers wc2 ON wc2.id = wca.alternative_work_center_id
      WHERE wca.work_center_id = ?
      ORDER BY wc2.name
    `).all(id);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Get alternatives error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/:id/alternatives', (req, res) => {
  try {
    const { id } = req.params;
    const { alternative_work_center_id } = req.body;
    if (!alternative_work_center_id) {
      return res.status(400).json({ success: false, message: 'alternative_work_center_id is required' });
    }
    const exists = db.prepare('SELECT id FROM work_centers WHERE id = ?').get(alternative_work_center_id);
    if (!exists) {
      return res.status(404).json({ success: false, message: 'Alternative work center not found' });
    }
    const stmt = db.prepare('INSERT INTO work_center_alternatives (work_center_id, alternative_work_center_id) VALUES (?, ?)');
    const result = stmt.run(id, alternative_work_center_id);
    res.status(201).json({ success: true, message: 'Alternative added', data: { id: result.lastInsertRowid } });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      return res.status(409).json({ success: false, message: 'Alternative already linked' });
    }
    console.error('Add alternative error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.delete('/:id/alternatives/:altId', (req, res) => {
  try {
    const { id, altId } = req.params;
    const existing = db.prepare('SELECT id FROM work_center_alternatives WHERE id = ? AND work_center_id = ?').get(altId, id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Alternative link not found' });
    }
    db.prepare('DELETE FROM work_center_alternatives WHERE id = ?').run(altId);
    res.json({ success: true, message: 'Alternative removed' });
  } catch (error) {
    console.error('Remove alternative error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
