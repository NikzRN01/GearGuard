const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');

// Initialize database
// SQLITE_DB_PATH lets deployments (and the test suite) point at an alternate file.
const dbFilePath = process.env.SQLITE_DB_PATH
  ? path.resolve(process.env.SQLITE_DB_PATH)
  : process.env.VERCEL
    ? path.join('/tmp', 'portal.db')
    : path.join(__dirname, 'portal.db');

const db = new Database(dbFilePath);

if (process.env.VERCEL) {
  console.warn('Using /tmp SQLite database on Vercel. Data is ephemeral between cold starts.');
}

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

const createSessionsTable = () => {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      csrf_token TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)').run();
};

const createAuditLogTable = () => {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      metadata_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `).run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_user_id)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id)').run();
};

// Only the SHA-256 hash of a reset token is stored, so a database leak cannot
// be replayed against the reset endpoint.
const createPasswordResetTokensTable = () => {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens(expires_at)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id)').run();
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
      category TEXT,
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

const ensureEquipmentCategoryColumn = () => {
  const columns = db.prepare('PRAGMA table_info(equipment)').all();
  const hasCategory = columns.some((c) => c.name === 'category');
  if (!hasCategory) {
    db.prepare('ALTER TABLE equipment ADD COLUMN category TEXT').run();
  }
};

// Create maintenance_requests table
const createMaintenanceRequestsTable = () => {
  const query = `
    CREATE TABLE IF NOT EXISTS maintenance_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      subject TEXT NOT NULL,
      equipment_id INTEGER,
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

// Migrate maintenance_requests to allow equipment_id to be NULL (so work_center_id-only requests work).
const migrateMaintenanceRequestsTable = () => {
  const columns = db.prepare('PRAGMA table_info(maintenance_requests)').all();
  if (!columns?.length) return;

  const equipmentCol = columns.find((c) => c.name === 'equipment_id');
  const hasWorkCenterId = columns.some((c) => c.name === 'work_center_id');

  const needsRebuild = Boolean(equipmentCol && equipmentCol.notnull === 1) || !hasWorkCenterId;
  if (!needsRebuild) return;

  const existingCols = new Set(columns.map((c) => c.name));
  const selectWorkCenter = existingCols.has('work_center_id') ? 'work_center_id' : 'NULL as work_center_id';

  db.prepare('PRAGMA foreign_keys = OFF').run();
  const tx = db.transaction(() => {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS maintenance_requests_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        subject TEXT NOT NULL,
        equipment_id INTEGER,
        work_center_id INTEGER,
        team_id INTEGER,
        scheduled_date DATE,
        status TEXT DEFAULT 'new',
        assigned_to_user_id INTEGER,
        duration_hours REAL,
        created_by_user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (equipment_id) REFERENCES equipment(id),
        FOREIGN KEY (work_center_id) REFERENCES work_centers(id),
        FOREIGN KEY (team_id) REFERENCES teams(id),
        FOREIGN KEY (assigned_to_user_id) REFERENCES users(id),
        FOREIGN KEY (created_by_user_id) REFERENCES users(id)
      )
    `).run();

    db.prepare(`
      INSERT INTO maintenance_requests_new (
        id, type, subject, equipment_id, work_center_id, team_id, scheduled_date,
        status, assigned_to_user_id, duration_hours, created_by_user_id, created_at, updated_at
      )
      SELECT
        id, type, subject, equipment_id, ${selectWorkCenter}, team_id, scheduled_date,
        status, assigned_to_user_id, duration_hours, created_by_user_id, created_at, updated_at
      FROM maintenance_requests
    `).run();

    db.prepare('DROP TABLE maintenance_requests').run();
    db.prepare('ALTER TABLE maintenance_requests_new RENAME TO maintenance_requests').run();
  });
  tx();
  db.prepare('PRAGMA foreign_keys = ON').run();
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

// Create work_centers table (no created_at, location, department per request)
const createWorkCentersTable = () => {
  const query = `
    CREATE TABLE IF NOT EXISTS work_centers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      code TEXT UNIQUE,
      tag TEXT,
      cost_per_hour REAL DEFAULT 0 CHECK(cost_per_hour >= 0),
      capacity_per_hour REAL DEFAULT 0 CHECK(capacity_per_hour >= 0),
      time_efficiency_pct REAL DEFAULT 100 CHECK(time_efficiency_pct BETWEEN 0 AND 100),
      oee_target_pct REAL DEFAULT 0 CHECK(oee_target_pct BETWEEN 0 AND 100),
      status TEXT DEFAULT 'active' CHECK(status IN ('active','inactive'))
    )
  `;
  db.prepare(query).run();
};

// Create work_center_alternatives linking table
const createWorkCenterAlternativesTable = () => {
  const query = `
    CREATE TABLE IF NOT EXISTS work_center_alternatives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_center_id INTEGER NOT NULL,
      alternative_work_center_id INTEGER NOT NULL,
      FOREIGN KEY (work_center_id) REFERENCES work_centers(id) ON DELETE CASCADE,
      FOREIGN KEY (alternative_work_center_id) REFERENCES work_centers(id) ON DELETE CASCADE,
      UNIQUE(work_center_id, alternative_work_center_id)
    )
  `;
  db.prepare(query).run();
};

// Add work_center_id to maintenance_requests if missing
const addWorkCenterIdColumn = () => {
  const columns = db.prepare("PRAGMA table_info(maintenance_requests)").all();
  const hasColumn = columns.some(c => c.name === 'work_center_id');
  if (!hasColumn) {
    db.prepare('ALTER TABLE maintenance_requests ADD COLUMN work_center_id INTEGER').run();
  }
};

const seedDemoData = () => {
  let demoPasswordHash;
  const teamCount = db.prepare('SELECT COUNT(1) as c FROM teams').get()?.c || 0;
  if (teamCount === 0) {
    const insertTeam = db.prepare('INSERT INTO teams (name) VALUES (?)');
    insertTeam.run('Internal Maintenance');
    insertTeam.run('Metrology');
    insertTeam.run('Subcontractor');
  }

  const teams = db.prepare('SELECT id, name FROM teams ORDER BY id').all();
  const internalTeam = teams.find((t) => t.name === 'Internal Maintenance') || teams[0];

  const userCount = db.prepare('SELECT COUNT(1) as c FROM users').get()?.c || 0;
  if (userCount === 0) {
    demoPasswordHash = bcrypt.hashSync('Password123!', 10);
    const insertUser = db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)');
    const managerId = insertUser.run('Mitchell Admin', 'manager@demo.com', demoPasswordHash, 'manager').lastInsertRowid;
    const tech1Id = insertUser.run('Marc Demo', 'tech1@demo.com', demoPasswordHash, 'technician').lastInsertRowid;
    const tech2Id = insertUser.run('Anas Makari', 'tech2@demo.com', demoPasswordHash, 'technician').lastInsertRowid;

    if (internalTeam?.id) {
      const addMember = db.prepare('INSERT OR IGNORE INTO team_members (team_id, user_id) VALUES (?, ?)');
      addMember.run(internalTeam.id, managerId);
      addMember.run(internalTeam.id, tech1Id);
      addMember.run(internalTeam.id, tech2Id);
    }
  }

  // Keep the local demo database usable after introducing the admin workspace.
  // Checking by email makes this idempotent for both fresh and existing databases.
  const demoAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@demo.com');
  if (!demoAdmin) {
    demoPasswordHash ||= bcrypt.hashSync('Password123!', 10);
    db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)')
      .run('GearGuard Admin', 'admin@demo.com', demoPasswordHash, 'admin');
  }

  const equipmentCount = db.prepare('SELECT COUNT(1) as c FROM equipment').get()?.c || 0;
  if (equipmentCount === 0) {
    const insertEq = db.prepare(`
      INSERT INTO equipment (
        name, serial_number, category, department, assigned_employee_name, location, maintenance_team_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertEq.run('Printer 01', 'PRN-001', 'Printers', 'Printers', 'Tejas Modi', 'Office', internalTeam?.id || null, 'active');
    insertEq.run('Acer Laptop', 'LP-203-19281928', 'Computers', 'Computers', 'Bhaumik P', 'Office', internalTeam?.id || null, 'active');
    insertEq.run('Samsung Monitor 15"', 'MT-125-22778837', 'Monitors', 'Monitors', 'Tejas Modi', 'Office', internalTeam?.id || null, 'active');
  }
};

// Initialize all tables
const initializeDatabase = () => {
  createUsersTable();
  createSessionsTable();
  createAuditLogTable();
  createPasswordResetTokensTable();
  createTeamsTable();
  createTeamMembersTable();
  createEquipmentTable();
  ensureEquipmentCategoryColumn();
  createMaintenanceRequestsTable();
  migrateMaintenanceRequestsTable();
  createNotesTable();
  createWorkCentersTable();
  createWorkCenterAlternativesTable();
  // For older DBs only; most are handled by migrateMaintenanceRequestsTable()
  addWorkCenterIdColumn();
  seedDemoData();
  console.log('Database initialized successfully');
};

initializeDatabase();

module.exports = db;
