/**
 * Schema and migration tests.
 *
 * This file deliberately does NOT use helpers.js: it builds a legacy-shaped
 * database on disk first, then loads database.js so the migration path runs
 * against it.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const test = require('node:test');
const assert = require('node:assert/strict');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gearguard-schema-'));
const dbFile = path.join(dir, 'legacy.db');

// A database as it existed before work centres were introduced: equipment_id is
// NOT NULL and there is no work_center_id column.
const legacy = new Database(dbFile);
legacy.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    avatar_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    serial_number TEXT NOT NULL UNIQUE,
    department TEXT,
    assigned_employee_name TEXT,
    purchase_date DATE,
    warranty_end_date DATE,
    location TEXT,
    maintenance_team_id INTEGER,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE maintenance_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    subject TEXT NOT NULL,
    equipment_id INTEGER NOT NULL,
    team_id INTEGER,
    scheduled_date DATE,
    status TEXT DEFAULT 'new',
    assigned_to_user_id INTEGER,
    duration_hours REAL,
    created_by_user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES maintenance_requests(id) ON DELETE CASCADE
  );
  INSERT INTO users (name, email, password, role) VALUES ('Legacy', 'legacy@demo.com', 'x', 'manager');
  INSERT INTO teams (name) VALUES ('Legacy Team');
  INSERT INTO equipment (name, serial_number) VALUES ('Legacy Printer', 'LEG-001');
  INSERT INTO maintenance_requests (type, subject, equipment_id, created_by_user_id)
    VALUES ('corrective', 'Legacy request', 1, 1);
  INSERT INTO notes (request_id, message) VALUES (1, 'legacy note');
`);
legacy.close();

process.env.SQLITE_DB_PATH = dbFile;
process.env.NODE_ENV = 'test';
const db = require('../database');

test.after(() => db.close());

test('migration preserves existing rows', () => {
  const request = db.prepare('SELECT * FROM maintenance_requests WHERE id = 1').get();
  assert.equal(request.subject, 'Legacy request');
  assert.equal(request.equipment_id, 1);

  const note = db.prepare('SELECT * FROM notes WHERE request_id = 1').get();
  assert.equal(note.message, 'legacy note');
});

test('migration makes equipment_id nullable and adds work_center_id', () => {
  const columns = db.prepare('PRAGMA table_info(maintenance_requests)').all();
  const byName = Object.fromEntries(columns.map((c) => [c.name, c]));

  assert.ok(byName.work_center_id, 'work_center_id column is missing');
  assert.equal(byName.equipment_id.notnull, 0, 'equipment_id must accept NULL for work-centre requests');
});

test('migration adds the equipment category column', () => {
  const columns = db.prepare('PRAGMA table_info(equipment)').all();
  assert.ok(columns.some((c) => c.name === 'category'), 'category column is missing');
});

test('all expected tables exist after initialisation', () => {
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  for (const expected of [
    'users', 'teams', 'team_members', 'equipment',
    'maintenance_requests', 'notes', 'work_centers', 'work_center_alternatives'
  ]) {
    assert.ok(names.includes(expected), `missing table: ${expected}`);
  }
  assert.ok(
    !names.includes('maintenance_requests_new'),
    'the migration scratch table was left behind'
  );
});

test('foreign key enforcement is enabled', () => {
  const [{ foreign_keys: enabled }] = db.prepare('PRAGMA foreign_keys').all();
  assert.equal(enabled, 1, 'ON DELETE CASCADE and FK checks are inert without this pragma');
});

test('deleting a request cascades to its notes', () => {
  const user = db.prepare('SELECT id FROM users LIMIT 1').get();
  const created = db.prepare(`
    INSERT INTO maintenance_requests (type, subject, equipment_id, created_by_user_id)
    VALUES ('corrective', 'Cascade probe', 1, ?)
  `).run(user.id);
  db.prepare('INSERT INTO notes (request_id, message) VALUES (?, ?)')
    .run(created.lastInsertRowid, 'cascade me');

  db.prepare('DELETE FROM maintenance_requests WHERE id = ?').run(created.lastInsertRowid);

  const left = db.prepare('SELECT COUNT(1) AS c FROM notes WHERE request_id = ?')
    .get(created.lastInsertRowid);
  assert.equal(left.c, 0, 'orphaned notes remain after their request was deleted');
});

test('work_centers CHECK constraints reject out-of-range values', () => {
  const insert = db.prepare('INSERT INTO work_centers (name, time_efficiency_pct) VALUES (?, ?)');
  assert.throws(() => insert.run('Bad efficiency', 150));
  assert.throws(() =>
    db.prepare('INSERT INTO work_centers (name, cost_per_hour) VALUES (?, ?)').run('Bad cost', -1)
  );
});

test('running initialisation twice is idempotent', () => {
  const before = db.prepare('SELECT COUNT(1) AS c FROM users').get().c;
  delete require.cache[require.resolve('../database')];
  require('../database');
  const after = db.prepare('SELECT COUNT(1) AS c FROM users').get().c;
  assert.equal(after, before, 're-initialising the schema must not duplicate seed data');
});
