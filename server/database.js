const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');
const { validatePassword } = require('./lib/validation');

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

// Email addresses are not case-sensitive in practice. The column's own UNIQUE
// constraint compares byte-for-byte, so without this index "Alex@x.com" and
// "alex@x.com" would become two accounts that look identical at the login form.
// Routes compare on LOWER(email), which this index also serves.
const ensureCaseInsensitiveEmailIndex = () => {
  const duplicates = db
    .prepare('SELECT LOWER(email) AS key, COUNT(*) AS count FROM users GROUP BY LOWER(email) HAVING count > 1')
    .all();
  if (duplicates.length > 0) {
    // Refuse silently rather than crash the boot: an operator has to decide
    // which of the colliding accounts survives.
    console.warn(
      `Cannot enforce case-insensitive email uniqueness: ${duplicates.length} address(es) already differ only by case.`
    );
    return;
  }
  db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_nocase ON users(LOWER(email))').run();
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

  // Foreign keys must be off while the table is swapped, and must be restored
  // even if the rebuild fails - otherwise the whole process would keep running
  // with constraint enforcement silently disabled.
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
  try {
    tx();
  } finally {
    db.prepare('PRAGMA foreign_keys = ON').run();
  }
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

/**
 * Records who wrote each note.
 *
 * Added after the fact, so existing rows keep a NULL author: the information
 * was never captured and inventing one would put a name against words somebody
 * else wrote. Readers must render NULL as unknown rather than assume.
 *
 * SQLite cannot attach a foreign key through ALTER TABLE, so the reference is
 * enforced by the route (the author is always the session user) rather than by
 * the schema.
 */
const ensureNotesAuthorColumn = () => {
  const columns = db.prepare('PRAGMA table_info(notes)').all();
  if (!columns.some((column) => column.name === 'created_by_user_id')) {
    db.prepare('ALTER TABLE notes ADD COLUMN created_by_user_id INTEGER').run();
  }
  db.prepare('CREATE INDEX IF NOT EXISTS idx_notes_author ON notes(created_by_user_id)').run();
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

/**
 * Whether this process is serving real users.
 *
 * NODE_ENV alone is not enough: forgetting to set it on a deployment is the
 * exact mistake this check exists to survive, so the platform's own marker
 * counts too.
 */
const isProductionLike = () =>
  process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

/**
 * Whether the published-credential demo accounts may be created.
 *
 * These accounts use a password that is committed to this repository, so a
 * deployment that seeds them has an administrator anyone can log into. The
 * guard is deliberately one-way: production-like environments can never opt
 * back in, and everywhere else can opt out with SEED_DEMO_DATA=false.
 */
const demoSeedAllowed = () => {
  if (isProductionLike()) return false;
  return String(process.env.SEED_DEMO_DATA ?? 'true').toLowerCase() !== 'false';
};

const seedDemoData = () => {
  if (!demoSeedAllowed()) return;

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

  const demoUser = db.prepare('SELECT id FROM users WHERE email = ?').get('user@demo.com');
  if (!demoUser) {
    demoPasswordHash ||= bcrypt.hashSync('Password123!', 10);
    db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)')
      .run('GearGuard User', 'user@demo.com', demoPasswordHash, 'user');
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

// A richer development-only dataset for visually exercising every operational
// field and state. Stable natural keys plus INSERT OR IGNORE keep this safe to
// run on every local boot without duplicating records.
const seedShowcaseData = () => {
  if (process.env.NODE_ENV === 'test' || isProductionLike()) return;
  if (String(process.env.SEED_SHOWCASE_DATA || 'true').toLowerCase() === 'false') return;

  const passwordHash = bcrypt.hashSync('Password123!', 10);
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (name, email, password, role, avatar_url)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertUser.run('Priya Sharma', 'priya.tech@demo.com', passwordHash, 'technician', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330');
  insertUser.run('Noah Williams', 'noah.user@demo.com', passwordHash, 'user', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e');

  const avatars = [
    ['manager@demo.com', 'https://images.unsplash.com/photo-1560250097-0b93528c311a'],
    ['tech1@demo.com', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e'],
    ['tech2@demo.com', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d'],
    ['admin@demo.com', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7'],
    ['user@demo.com', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb']
  ];
  const setAvatar = db.prepare('UPDATE users SET avatar_url = COALESCE(avatar_url, ?) WHERE email = ?');
  for (const [email, avatar] of avatars) setAvatar.run(avatar, email);

  const insertTeam = db.prepare('INSERT OR IGNORE INTO teams (name) VALUES (?)');
  ['Facilities Response', 'Electrical Reliability'].forEach((name) => insertTeam.run(name));
  const teamByName = Object.fromEntries(db.prepare('SELECT id, name FROM teams').all().map((row) => [row.name, row.id]));
  const userByEmail = Object.fromEntries(db.prepare('SELECT id, email FROM users').all().map((row) => [row.email, row.id]));

  const addMember = db.prepare('INSERT OR IGNORE INTO team_members (team_id, user_id) VALUES (?, ?)');
  addMember.run(teamByName['Internal Maintenance'], userByEmail['priya.tech@demo.com']);
  addMember.run(teamByName['Facilities Response'], userByEmail['manager@demo.com']);
  addMember.run(teamByName['Facilities Response'], userByEmail['tech1@demo.com']);
  addMember.run(teamByName['Electrical Reliability'], userByEmail['tech2@demo.com']);
  addMember.run(teamByName['Electrical Reliability'], userByEmail['priya.tech@demo.com']);

  const insertWorkCenter = db.prepare(`
    INSERT OR IGNORE INTO work_centers
      (name, code, tag, cost_per_hour, capacity_per_hour, time_efficiency_pct, oee_target_pct, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertWorkCenter.run('Assembly Line 1', 'WC-ASM-01', 'assembly', 1850.5, 24, 92.5, 88, 'active');
  insertWorkCenter.run('Precision Lab', 'WC-MET-02', 'metrology', 2650, 8, 97, 93.5, 'active');
  insertWorkCenter.run('Legacy Paint Booth', 'WC-PNT-OLD', 'coating', 975.75, 5, 68, 72, 'inactive');
  const workCenterByName = Object.fromEntries(db.prepare('SELECT id, name FROM work_centers').all().map((row) => [row.name, row.id]));
  const addAlternative = db.prepare(`
    INSERT OR IGNORE INTO work_center_alternatives (work_center_id, alternative_work_center_id)
    VALUES (?, ?)
  `);
  addAlternative.run(workCenterByName['Assembly Line 1'], workCenterByName['Precision Lab']);
  addAlternative.run(workCenterByName['Precision Lab'], workCenterByName['Assembly Line 1']);

  const insertEquipment = db.prepare(`
    INSERT OR IGNORE INTO equipment
      (name, serial_number, category, department, assigned_employee_name, purchase_date,
       warranty_end_date, location, maintenance_team_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertEquipment.run('CNC Milling Machine', 'CNC-5AX-0042', 'Production Machinery', 'Manufacturing', 'Aarav Mehta', '2023-03-15', '2028-03-14', 'Plant A · Bay 04', teamByName['Internal Maintenance'], 'active');
  insertEquipment.run('Hydraulic Press 20T', 'HPR-20T-0187', 'Hydraulics', 'Fabrication', 'Maya Singh', '2019-08-01', '2022-07-31', 'Plant B · Press Zone', teamByName['Facilities Response'], 'maintenance');
  insertEquipment.run('Digital Calibrator', 'CAL-DIG-0098', 'Measurement', 'Quality Assurance', 'Priya Sharma', '2025-01-12', '2027-01-11', 'Precision Lab · Cabinet 3', teamByName['Electrical Reliability'], 'active');
  insertEquipment.run('Retired Air Compressor', 'CMP-AIR-0007', 'Utilities', 'Facilities', 'Unassigned', '2012-05-20', '2015-05-19', 'Storage Yard · Row C', null, 'retired');
  const equipmentBySerial = Object.fromEntries(db.prepare('SELECT id, serial_number FROM equipment').all().map((row) => [row.serial_number, row.id]));

  const isoDate = (offsetDays) => {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    return date.toISOString().slice(0, 10);
  };
  const insertRequest = db.prepare(`
    INSERT INTO maintenance_requests
      (type, subject, equipment_id, work_center_id, team_id, scheduled_date, status,
       assigned_to_user_id, duration_hours, created_by_user_id, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?), datetime('now', ?)
    WHERE NOT EXISTS (SELECT 1 FROM maintenance_requests WHERE subject = ?)
  `);
  const requestRows = [
    ['corrective', 'CNC spindle vibration above threshold', equipmentBySerial['CNC-5AX-0042'], null, teamByName['Internal Maintenance'], isoDate(-2), 'new', null, null, userByEmail['user@demo.com'], '-3 days', '-3 days'],
    ['preventive', 'Quarterly hydraulic pressure inspection', equipmentBySerial['HPR-20T-0187'], null, teamByName['Facilities Response'], isoDate(0), 'in_progress', userByEmail['tech1@demo.com'], 2.5, userByEmail['noah.user@demo.com'], '-5 days', '-2 hours'],
    ['corrective', 'Assembly conveyor sensor intermittently failing', null, workCenterByName['Assembly Line 1'], teamByName['Electrical Reliability'], isoDate(2), 'in_progress', userByEmail['tech2@demo.com'], 1.25, userByEmail['manager@demo.com'], '-2 days', '-1 hour'],
    ['preventive', 'Calibrator annual certification completed', equipmentBySerial['CAL-DIG-0098'], null, teamByName['Electrical Reliability'], isoDate(-7), 'repaired', userByEmail['priya.tech@demo.com'], 3.75, userByEmail['user@demo.com'], '-12 days', '-7 days'],
    ['corrective', 'Legacy paint extraction motor beyond repair', null, workCenterByName['Legacy Paint Booth'], teamByName['Subcontractor'], isoDate(-14), 'scrap', userByEmail['tech1@demo.com'], 6, userByEmail['manager@demo.com'], '-20 days', '-14 days'],
    ['preventive', 'Precision lab environmental validation', null, workCenterByName['Precision Lab'], teamByName['Metrology'], isoDate(7), 'new', userByEmail['priya.tech@demo.com'], 4, userByEmail['noah.user@demo.com'], '-1 day', '-1 day']
  ];
  for (const row of requestRows) insertRequest.run(...row, row[1]);

  const requests = Object.fromEntries(db.prepare('SELECT id, subject FROM maintenance_requests').all().map((row) => [row.subject, row.id]));
  const insertNote = db.prepare(`
    INSERT INTO notes (request_id, message, created_at)
    SELECT ?, ?, datetime('now', ?)
    WHERE NOT EXISTS (SELECT 1 FROM notes WHERE request_id = ? AND message = ?)
  `);
  const notes = [
    ['Quarterly hydraulic pressure inspection', 'Lockout/tagout completed. Pressure stabilized at 178 bar.', '-90 minutes'],
    ['Assembly conveyor sensor intermittently failing', 'Replacement proximity sensor ordered; temporary bypass documented.', '-45 minutes'],
    ['Calibrator annual certification completed', 'Certificate QA-2026-114 attached to the equipment record.', '-7 days'],
    ['Legacy paint extraction motor beyond repair', 'Manager approved scrapping after vendor inspection.', '-14 days']
  ];
  for (const [subject, message, age] of notes) {
    const requestId = requests[subject];
    if (requestId) insertNote.run(requestId, message, age, requestId, message);
  }

  const adminId = userByEmail['admin@demo.com'];
  const insertAudit = db.prepare(`
    INSERT INTO audit_log (actor_user_id, action, resource_type, resource_id, metadata_json, created_at)
    SELECT ?, ?, ?, ?, ?, datetime('now', ?)
    WHERE NOT EXISTS (SELECT 1 FROM audit_log WHERE action = ? AND resource_id = ?)
  `);
  const auditRows = [
    [adminId, 'admin.user.role.review', 'user', String(userByEmail['priya.tech@demo.com']), JSON.stringify({ role: 'technician', outcome: 'confirmed' }), '-30 minutes'],
    [adminId, 'equipment.register.review', 'equipment', String(equipmentBySerial['CNC-5AX-0042']), JSON.stringify({ fieldsReviewed: 10, source: 'showcase-seed' }), '-2 hours'],
    [userByEmail['manager@demo.com'], 'maintenance.request.assign', 'maintenance_request', String(requests['Assembly conveyor sensor intermittently failing']), JSON.stringify({ assignedTo: 'Anas Makari', team: 'Electrical Reliability' }), '-1 day']
  ];
  for (const row of auditRows) insertAudit.run(...row, row[1], row[3]);
};

/**
 * Creates the first administrator from the environment.
 *
 * With the demo seed barred from production, a real deployment needs some way
 * to obtain its first admin - otherwise nobody can reach the governance screens
 * and no further accounts can be promoted. Set BOOTSTRAP_ADMIN_EMAIL and
 * BOOTSTRAP_ADMIN_PASSWORD for the first boot, then remove them.
 *
 * Deliberate properties:
 * - Runs only when the instance has no administrator at all, so it cannot be
 *   used to silently add a second one later, or to reset an existing account.
 * - Enforces the same password policy as the signup form, so the bootstrap
 *   cannot become the weakest credential in the system.
 * - Never logs the password.
 */
const bootstrapAdmin = () => {
  const existingAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (existingAdmin) return;

  const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim();
  const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '');
  const name = String(process.env.BOOTSTRAP_ADMIN_NAME || '').trim() || 'GearGuard Administrator';

  if (!email && !password) {
    if (isProductionLike()) {
      console.warn(
        'No administrator account exists. Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD '
        + 'to create one on the next boot.'
      );
    }
    return;
  }

  if (!email || !password) {
    console.error('Admin bootstrap skipped: BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must both be set.');
    return;
  }

  const passwordErrors = validatePassword(password);
  if (passwordErrors.length > 0) {
    console.error(`Admin bootstrap skipped: ${passwordErrors.join('. ')}.`);
    return;
  }

  // A non-admin may already own this address; promoting it here would be an
  // unlogged privilege grant, so refuse and let an operator decide.
  const taken = db.prepare('SELECT id, role FROM users WHERE LOWER(email) = LOWER(?)').get(email);
  if (taken) {
    console.error(`Admin bootstrap skipped: ${email} already belongs to a ${taken.role} account.`);
    return;
  }

  db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)')
    .run(name, email, bcrypt.hashSync(password, 10), 'admin');

  console.warn(
    `Created the first administrator (${email}) from BOOTSTRAP_ADMIN_*. `
    + 'Remove those variables and change the password after signing in.'
  );
};

// Initialize all tables
const initializeDatabase = () => {
  createUsersTable();
  ensureCaseInsensitiveEmailIndex();
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
  ensureNotesAuthorColumn();
  createWorkCentersTable();
  createWorkCenterAlternativesTable();
  // For older DBs only; most are handled by migrateMaintenanceRequestsTable()
  addWorkCenterIdColumn();
  seedDemoData();
  seedShowcaseData();
  // After seeding: in development the demo seed already supplies an admin, so
  // this is a no-op there and only does work on a real deployment.
  bootstrapAdmin();
  console.log('Database initialized successfully');
};

initializeDatabase();

module.exports = db;
