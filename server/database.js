const Database = require('better-sqlite3');
const path = require('path');

// Initialize database
const db = new Database(path.join(__dirname, 'portal.db'));

// Create users table
const createUsersTable = () => {
  const query = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      avatar_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;
  
  db.prepare(query).run();
};

// Create teams table
const createTeamsTable = () => {
  const query = `
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;
  
  db.prepare(query).run();
};

// Create team_members table
const createTeamMembersTable = () => {
  const query = `
    CREATE TABLE IF NOT EXISTS team_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(team_id, user_id)
    )
  `;
  
  db.prepare(query).run();
};

// Create equipment table
const createEquipmentTable = () => {
  const query = `
    CREATE TABLE IF NOT EXISTS equipment (
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (maintenance_team_id) REFERENCES teams(id)
    )
  `;
  
  db.prepare(query).run();
};

// Create maintenance_requests table
const createMaintenanceRequestsTable = () => {
  const query = `
    CREATE TABLE IF NOT EXISTS maintenance_requests (
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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (equipment_id) REFERENCES equipment(id),
      FOREIGN KEY (team_id) REFERENCES teams(id),
      FOREIGN KEY (assigned_to_user_id) REFERENCES users(id),
      FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    )
  `;
  
  db.prepare(query).run();
};

// Create notes table
const createNotesTable = () => {
  const query = `
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (request_id) REFERENCES maintenance_requests(id) ON DELETE CASCADE
    )
  `;
  
  db.prepare(query).run();
};

// Initialize all tables
const initializeDatabase = () => {
  createUsersTable();
  createTeamsTable();
  createTeamMembersTable();
  createEquipmentTable();
  createMaintenanceRequestsTable();
  createNotesTable();
  console.log('Database initialized successfully');
};

initializeDatabase();

module.exports = db;
