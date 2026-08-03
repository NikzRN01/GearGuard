/**
 * Database access and startup seeding.
 *
 * Schema now lives in server/migrations/*.sql and is applied by db/migrate.js,
 * so this file no longer creates or alters tables. What remains is the query
 * surface the routes use, the development seeds, and the production admin
 * bootstrap.
 *
 * Note the shape change from the SQLite build: every helper is async. The
 * routes await them, and `initializeDatabase()` must be awaited before the
 * server accepts traffic.
 */
const bcrypt = require('bcrypt');
const { createPool, schemaName } = require('./db/pool');
const { helpersFor } = require('./db/sql');
const { migrate } = require('./db/migrate');
const { validatePassword } = require('./lib/validation');

const pool = createPool();
const base = helpersFor(pool);

/**
 * Runs `fn` inside a transaction on a single pooled client.
 *
 * Replaces better-sqlite3's synchronous `db.transaction()`. The callback is
 * handed the same get/all/run/insert surface, bound to the client, so a
 * transaction body reads the same as any other code.
 */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(helpersFor(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

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

const seedDemoData = async () => {
  if (!demoSeedAllowed()) return;

  let demoPasswordHash;
  const teamCount = Number((await base.get('SELECT COUNT(1) AS c FROM teams'))?.c || 0);
  if (teamCount === 0) {
    for (const name of ['Internal Maintenance', 'Metrology', 'Subcontractor']) {
      await base.run('INSERT INTO teams (name) VALUES (?) ON CONFLICT (name) DO NOTHING', [name]);
    }
  }

  const teams = await base.all('SELECT id, name FROM teams ORDER BY id');
  const internalTeam = teams.find((t) => t.name === 'Internal Maintenance') || teams[0];

  const userCount = Number((await base.get('SELECT COUNT(1) AS c FROM users'))?.c || 0);
  if (userCount === 0) {
    demoPasswordHash = bcrypt.hashSync('Password123!', 10);
    const insertUser = (name, email, role) =>
      base.insert('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', [name, email, demoPasswordHash, role]);

    const managerId = (await insertUser('Mitchell Admin', 'manager@demo.com', 'manager')).id;
    const tech1Id = (await insertUser('Marc Demo', 'tech1@demo.com', 'technician')).id;
    const tech2Id = (await insertUser('Anas Makari', 'tech2@demo.com', 'technician')).id;

    if (internalTeam?.id) {
      for (const userId of [managerId, tech1Id, tech2Id]) {
        await base.run(
          'INSERT INTO team_members (team_id, user_id) VALUES (?, ?) ON CONFLICT (team_id, user_id) DO NOTHING',
          [internalTeam.id, userId]
        );
      }
    }
  }

  // Keep the local demo database usable after introducing the admin workspace.
  // Checking by email makes this idempotent for both fresh and existing databases.
  const demoAdmin = await base.get('SELECT id FROM users WHERE email = ?', ['admin@demo.com']);
  if (!demoAdmin) {
    demoPasswordHash ||= bcrypt.hashSync('Password123!', 10);
    await base.run('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', [
      'GearGuard Admin', 'admin@demo.com', demoPasswordHash, 'admin'
    ]);
  }

  const demoUser = await base.get('SELECT id FROM users WHERE email = ?', ['user@demo.com']);
  if (!demoUser) {
    demoPasswordHash ||= bcrypt.hashSync('Password123!', 10);
    await base.run('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', [
      'GearGuard User', 'user@demo.com', demoPasswordHash, 'user'
    ]);
  }

  const equipmentCount = Number((await base.get('SELECT COUNT(1) AS c FROM equipment'))?.c || 0);
  if (equipmentCount === 0) {
    const rows = [
      ['Printer 01', 'PRN-001', 'Printers', 'Printers', 'Tejas Modi', 'Office'],
      ['Acer Laptop', 'LP-203-19281928', 'Computers', 'Computers', 'Bhaumik P', 'Office'],
      ['Samsung Monitor 15"', 'MT-125-22778837', 'Monitors', 'Monitors', 'Tejas Modi', 'Office']
    ];
    for (const [name, serial, category, department, employee, location] of rows) {
      await base.run(`
        INSERT INTO equipment (
          name, serial_number, category, department, assigned_employee_name, location, maintenance_team_id, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (serial_number) DO NOTHING
      `, [name, serial, category, department, employee, location, internalTeam?.id || null, 'active']);
    }
  }
};

/**
 * A richer development-only dataset for visually exercising every operational
 * field and state. Stable natural keys plus ON CONFLICT DO NOTHING keep this
 * safe to run on every local boot without duplicating records.
 */
const seedShowcaseData = async () => {
  if (process.env.NODE_ENV === 'test' || isProductionLike()) return;
  if (String(process.env.SEED_SHOWCASE_DATA || 'true').toLowerCase() === 'false') return;
  // Showcase records decorate the demo accounts, so without them there is
  // nothing coherent to attach to.
  if (!demoSeedAllowed()) return;

  const passwordHash = bcrypt.hashSync('Password123!', 10);
  const insertUser = (name, email, role, avatar) => base.run(`
    INSERT INTO users (name, email, password, role, avatar_url)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (email) DO NOTHING
  `, [name, email, passwordHash, role, avatar]);

  await insertUser('Priya Sharma', 'priya.tech@demo.com', 'technician', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330');
  await insertUser('Noah Williams', 'noah.user@demo.com', 'user', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e');

  const avatars = [
    ['manager@demo.com', 'https://images.unsplash.com/photo-1560250097-0b93528c311a'],
    ['tech1@demo.com', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e'],
    ['tech2@demo.com', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d'],
    ['admin@demo.com', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7'],
    ['user@demo.com', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb']
  ];
  for (const [email, avatar] of avatars) {
    await base.run('UPDATE users SET avatar_url = COALESCE(avatar_url, ?) WHERE email = ?', [avatar, email]);
  }

  for (const name of ['Facilities Response', 'Electrical Reliability']) {
    await base.run('INSERT INTO teams (name) VALUES (?) ON CONFLICT (name) DO NOTHING', [name]);
  }

  const teamByName = Object.fromEntries((await base.all('SELECT id, name FROM teams')).map((r) => [r.name, r.id]));
  const userByEmail = Object.fromEntries((await base.all('SELECT id, email FROM users')).map((r) => [r.email, r.id]));

  const addMember = (teamId, userId) => base.run(
    'INSERT INTO team_members (team_id, user_id) VALUES (?, ?) ON CONFLICT (team_id, user_id) DO NOTHING',
    [teamId, userId]
  );
  await addMember(teamByName['Internal Maintenance'], userByEmail['priya.tech@demo.com']);
  await addMember(teamByName['Facilities Response'], userByEmail['manager@demo.com']);
  await addMember(teamByName['Facilities Response'], userByEmail['tech1@demo.com']);
  await addMember(teamByName['Electrical Reliability'], userByEmail['tech2@demo.com']);
  await addMember(teamByName['Electrical Reliability'], userByEmail['priya.tech@demo.com']);

  const workCenters = [
    ['Assembly Line 1', 'WC-ASM-01', 'assembly', 1850.5, 24, 92.5, 88, 'active'],
    ['Precision Lab', 'WC-MET-02', 'metrology', 2650, 8, 97, 93.5, 'active'],
    ['Legacy Paint Booth', 'WC-PNT-OLD', 'coating', 975.75, 5, 68, 72, 'inactive']
  ];
  for (const row of workCenters) {
    await base.run(`
      INSERT INTO work_centers
        (name, code, tag, cost_per_hour, capacity_per_hour, time_efficiency_pct, oee_target_pct, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (name) DO NOTHING
    `, row);
  }

  const workCenterByName = Object.fromEntries((await base.all('SELECT id, name FROM work_centers')).map((r) => [r.name, r.id]));
  const addAlternative = (a, b) => base.run(`
    INSERT INTO work_center_alternatives (work_center_id, alternative_work_center_id)
    VALUES (?, ?)
    ON CONFLICT (work_center_id, alternative_work_center_id) DO NOTHING
  `, [a, b]);
  await addAlternative(workCenterByName['Assembly Line 1'], workCenterByName['Precision Lab']);
  await addAlternative(workCenterByName['Precision Lab'], workCenterByName['Assembly Line 1']);

  const equipmentRows = [
    ['CNC Milling Machine', 'CNC-5AX-0042', 'Production Machinery', 'Manufacturing', 'Aarav Mehta', '2023-03-15', '2028-03-14', 'Plant A · Bay 04', teamByName['Internal Maintenance'], 'active'],
    ['Hydraulic Press 20T', 'HPR-20T-0187', 'Hydraulics', 'Fabrication', 'Maya Singh', '2019-08-01', '2022-07-31', 'Plant B · Press Zone', teamByName['Facilities Response'], 'maintenance'],
    ['Digital Calibrator', 'CAL-DIG-0098', 'Measurement', 'Quality Assurance', 'Priya Sharma', '2025-01-12', '2027-01-11', 'Precision Lab · Cabinet 3', teamByName['Electrical Reliability'], 'active'],
    ['Retired Air Compressor', 'CMP-AIR-0007', 'Utilities', 'Facilities', 'Unassigned', '2012-05-20', '2015-05-19', 'Storage Yard · Row C', null, 'retired']
  ];
  for (const row of equipmentRows) {
    await base.run(`
      INSERT INTO equipment
        (name, serial_number, category, department, assigned_employee_name, purchase_date,
         warranty_end_date, location, maintenance_team_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (serial_number) DO NOTHING
    `, row);
  }

  const equipmentBySerial = Object.fromEntries(
    (await base.all('SELECT id, serial_number FROM equipment')).map((r) => [r.serial_number, r.id])
  );

  const isoDate = (offsetDays) => {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    return date.toISOString().slice(0, 10);
  };

  const requestRows = [
    ['corrective', 'CNC spindle vibration above threshold', equipmentBySerial['CNC-5AX-0042'], null, teamByName['Internal Maintenance'], isoDate(-2), 'new', null, null, userByEmail['user@demo.com'], '3 days'],
    ['preventive', 'Quarterly hydraulic pressure inspection', equipmentBySerial['HPR-20T-0187'], null, teamByName['Facilities Response'], isoDate(0), 'in_progress', userByEmail['tech1@demo.com'], 2.5, userByEmail['noah.user@demo.com'], '5 days'],
    ['corrective', 'Assembly conveyor sensor intermittently failing', null, workCenterByName['Assembly Line 1'], teamByName['Electrical Reliability'], isoDate(2), 'in_progress', userByEmail['tech2@demo.com'], 1.25, userByEmail['manager@demo.com'], '2 days'],
    ['preventive', 'Calibrator annual certification completed', equipmentBySerial['CAL-DIG-0098'], null, teamByName['Electrical Reliability'], isoDate(-7), 'repaired', userByEmail['priya.tech@demo.com'], 3.75, userByEmail['user@demo.com'], '12 days'],
    ['corrective', 'Legacy paint extraction motor beyond repair', null, workCenterByName['Legacy Paint Booth'], teamByName['Subcontractor'], isoDate(-14), 'scrap', userByEmail['tech1@demo.com'], 6, userByEmail['manager@demo.com'], '20 days'],
    ['preventive', 'Precision lab environmental validation', null, workCenterByName['Precision Lab'], teamByName['Metrology'], isoDate(7), 'new', userByEmail['priya.tech@demo.com'], 4, userByEmail['noah.user@demo.com'], '1 day']
  ];
  for (const row of requestRows) {
    const [type, subject, equipmentId, workCenterId, teamId, scheduled, status, assignee, duration, creator, age] = row;
    await base.run(`
      INSERT INTO maintenance_requests
        (type, subject, equipment_id, work_center_id, team_id, scheduled_date, status,
         assigned_to_user_id, duration_hours, created_by_user_id, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now() - ?::interval, now() - ?::interval
      WHERE NOT EXISTS (SELECT 1 FROM maintenance_requests WHERE subject = ?)
    `, [type, subject, equipmentId, workCenterId, teamId, scheduled, status, assignee, duration, creator, age, age, subject]);
  }

  const requests = Object.fromEntries(
    (await base.all('SELECT id, subject FROM maintenance_requests')).map((r) => [r.subject, r.id])
  );

  const notes = [
    ['Quarterly hydraulic pressure inspection', 'Lockout/tagout completed. Pressure stabilized at 178 bar.', '90 minutes'],
    ['Assembly conveyor sensor intermittently failing', 'Replacement proximity sensor ordered; temporary bypass documented.', '45 minutes'],
    ['Calibrator annual certification completed', 'Certificate QA-2026-114 attached to the equipment record.', '7 days'],
    ['Legacy paint extraction motor beyond repair', 'Manager approved scrapping after vendor inspection.', '14 days']
  ];
  for (const [subject, message, age] of notes) {
    const requestId = requests[subject];
    if (!requestId) continue;
    await base.run(`
      INSERT INTO notes (request_id, message, created_at)
      SELECT ?, ?, now() - ?::interval
      WHERE NOT EXISTS (SELECT 1 FROM notes WHERE request_id = ? AND message = ?)
    `, [requestId, message, age, requestId, message]);
  }

  const adminId = userByEmail['admin@demo.com'];
  const auditRows = [
    [adminId, 'admin.user.role.review', 'user', String(userByEmail['priya.tech@demo.com']), JSON.stringify({ role: 'technician', outcome: 'confirmed' }), '30 minutes'],
    [adminId, 'equipment.register.review', 'equipment', String(equipmentBySerial['CNC-5AX-0042']), JSON.stringify({ fieldsReviewed: 10, source: 'showcase-seed' }), '2 hours'],
    [userByEmail['manager@demo.com'], 'maintenance.request.assign', 'maintenance_request', String(requests['Assembly conveyor sensor intermittently failing']), JSON.stringify({ assignedTo: 'Anas Makari', team: 'Electrical Reliability' }), '1 day']
  ];
  for (const [actor, action, resourceType, resourceId, metadata, age] of auditRows) {
    await base.run(`
      INSERT INTO audit_log (actor_user_id, action, resource_type, resource_id, metadata_json, created_at)
      SELECT ?, ?, ?, ?, ?, now() - ?::interval
      WHERE NOT EXISTS (SELECT 1 FROM audit_log WHERE action = ? AND resource_id = ?)
    `, [actor, action, resourceType, resourceId, metadata, age, action, resourceId]);
  }
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
const bootstrapAdmin = async () => {
  const existingAdmin = await base.get("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
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
  const taken = await base.get('SELECT id, role FROM users WHERE lower(email) = lower(?)', [email]);
  if (taken) {
    console.error(`Admin bootstrap skipped: ${email} already belongs to a ${taken.role} account.`);
    return;
  }

  await base.run('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', [
    name, email, bcrypt.hashSync(password, 10), 'admin'
  ]);

  console.warn(
    `Created the first administrator (${email}) from BOOTSTRAP_ADMIN_*. `
    + 'Remove those variables and change the password after signing in.'
  );
};

/** Applies migrations, then seeds. Must complete before the API serves traffic. */
const initializeDatabase = async () => {
  // The pool's search_path already points here, but the schema itself has to
  // exist before the first CREATE TABLE lands in it. The name is validated as a
  // plain identifier by schemaName(), which is what makes this interpolation
  // safe - a schema cannot be a bound parameter in DDL.
  const schema = schemaName();
  if (schema) await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);

  await migrate(pool);
  await seedDemoData();
  await seedShowcaseData();
  // After seeding: in development the demo seed already supplies an admin, so
  // this is a no-op there and only does work on a real deployment.
  await bootstrapAdmin();
  console.log('Database initialized successfully');
};

/** True when the database answers. Used by the health endpoint. */
const healthcheck = async () => {
  const { rows } = await pool.query('SELECT 1 AS ok');
  return rows[0]?.ok === 1;
};

const close = () => pool.end();

module.exports = {
  pool,
  query: base.query,
  get: base.get,
  all: base.all,
  run: base.run,
  insert: base.insert,
  tx,
  initializeDatabase,
  healthcheck,
  close
};
