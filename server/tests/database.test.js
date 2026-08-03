/**
 * Schema and migration-runner tests.
 *
 * The SQLite build had no migration system: schema changes were `CREATE TABLE
 * IF NOT EXISTS` plus hand-rolled table rebuilds, and this file tested that a
 * legacy-shaped file on disk was upgraded correctly. None of that survives the
 * move to PostgreSQL, so what is covered here now is the mechanism that
 * replaced it - and the schema guarantees the routes rely on.
 */
const { testSchema, teardown } = require('./testEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const db = require('../database');
const { migrate, readMigrations, checksumOf } = require('../db/migrate');

test.before(() => db.initializeDatabase());
test.after(() => teardown(db));

/** Columns of a table in the schema under test. */
const columnsOf = async (table) => {
  const rows = await db.all(`
    SELECT column_name, is_nullable, data_type
    FROM information_schema.columns
    WHERE table_schema = ? AND table_name = ?
  `, [testSchema, table]);
  return Object.fromEntries(rows.map((row) => [row.column_name, row]));
};

test('every expected table exists after initialisation', async () => {
  const rows = await db.all(
    'SELECT table_name FROM information_schema.tables WHERE table_schema = ?',
    [testSchema]
  );
  const names = rows.map((row) => row.table_name);

  for (const expected of [
    'users', 'sessions', 'audit_log', 'password_reset_tokens', 'teams',
    'team_members', 'equipment', 'maintenance_requests', 'notes',
    'work_centers', 'work_center_alternatives', 'schema_migrations'
  ]) {
    assert.ok(names.includes(expected), `missing table: ${expected}`);
  }
});

test('a request may target a work centre instead of equipment', async () => {
  const columns = await columnsOf('maintenance_requests');
  assert.ok(columns.work_center_id, 'work_center_id column is missing');
  assert.equal(columns.equipment_id.is_nullable, 'YES', 'equipment_id must accept NULL for work-centre requests');
});

test('notes record their author, nullably', async () => {
  const columns = await columnsOf('notes');
  assert.ok(columns.created_by_user_id, 'created_by_user_id column is missing');
  // Notes written before authorship was recorded have no author, and inventing
  // one would attribute somebody else's words.
  assert.equal(columns.created_by_user_id.is_nullable, 'YES');
});

test('timestamps are zone-aware', async () => {
  const columns = await columnsOf('maintenance_requests');
  // The SQLite build stored naive UTC strings, which the client had to
  // defensively re-parse. timestamptz removes that class of bug at the source.
  assert.equal(columns.created_at.data_type, 'timestamp with time zone');
});

test('deleting a request cascades to its notes', async () => {
  const user = await db.get('SELECT id FROM users LIMIT 1');
  const equipment = await db.insert(
    'INSERT INTO equipment (name, serial_number) VALUES (?, ?)',
    [`Cascade probe ${crypto.randomBytes(4).toString('hex')}`, `CAS-${crypto.randomBytes(4).toString('hex')}`]
  );
  const request = await db.insert(`
    INSERT INTO maintenance_requests (type, subject, equipment_id, created_by_user_id)
    VALUES ('corrective', 'Cascade probe', ?, ?)
  `, [equipment.id, user.id]);
  await db.run('INSERT INTO notes (request_id, message) VALUES (?, ?)', [request.id, 'cascade me']);

  await db.run('DELETE FROM maintenance_requests WHERE id = ?', [request.id]);

  const left = await db.get('SELECT COUNT(1) AS c FROM notes WHERE request_id = ?', [request.id]);
  assert.equal(Number(left.c), 0, 'orphaned notes remain after their request was deleted');
});

test('work_centers CHECK constraints reject out-of-range values', async () => {
  await assert.rejects(
    () => db.run('INSERT INTO work_centers (name, time_efficiency_pct) VALUES (?, ?)', ['Bad efficiency', 150])
  );
  await assert.rejects(
    () => db.run('INSERT INTO work_centers (name, cost_per_hour) VALUES (?, ?)', ['Bad cost', -1])
  );
});

test('email uniqueness ignores case', async () => {
  const email = `Case.${crypto.randomBytes(4).toString('hex')}@example.com`;
  await db.run('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', ['Case One', email, 'x']);
  await assert.rejects(
    () => db.run('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', ['Case Two', email.toUpperCase(), 'x']),
    'two accounts differing only by case must not both exist'
  );
});

test('migrations are recorded with their checksum', async () => {
  const files = await readMigrations();
  const applied = await db.all('SELECT version, checksum FROM schema_migrations');
  const byVersion = Object.fromEntries(applied.map((row) => [row.version, row.checksum]));

  assert.ok(files.length > 0, 'no migration files were found');
  for (const file of files) {
    assert.equal(byVersion[file.version], file.checksum, `checksum mismatch for ${file.version}`);
  }
});

test('running the migrator again applies nothing', async () => {
  const applied = await migrate(db.pool);
  assert.deepEqual(applied, [], 're-running migrations must be a no-op');
});

test('re-initialising does not duplicate seed data', async () => {
  const before = Number((await db.get('SELECT COUNT(1) AS c FROM users')).c);
  await db.initializeDatabase();
  const after = Number((await db.get('SELECT COUNT(1) AS c FROM users')).c);
  assert.equal(after, before);
});

test('an applied migration that changed on disk is refused', async () => {
  // Two environments silently disagreeing about their schema is worse than a
  // failed boot, so the runner stops rather than guessing.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gg-migrations-'));
  const file = path.join(dir, '001_probe.sql');
  await fs.writeFile(file, 'CREATE TABLE probe_one (id integer);');

  await migrate(db.pool, { dir, logger: { log() {} } });

  await fs.writeFile(file, 'CREATE TABLE probe_one (id integer, extra text);');
  await assert.rejects(
    () => migrate(db.pool, { dir, logger: { log() {} } }),
    /has changed since it was applied/
  );
});

test('a failing migration leaves the database untouched', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gg-migrations-'));
  await fs.writeFile(path.join(dir, '001_good.sql'), 'CREATE TABLE probe_good (id integer);');
  await fs.writeFile(path.join(dir, '002_bad.sql'), 'CREATE TABLE probe_bad (this is not valid sql);');

  await assert.rejects(() => migrate(db.pool, { dir, logger: { log() {} } }));

  // The whole run is one transaction, so the valid first file must have rolled
  // back too - a half-migrated database is the thing being prevented.
  const table = await db.get(
    'SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
    [testSchema, 'probe_good']
  );
  assert.equal(table, undefined, 'a failed run must not leave earlier migrations applied');
});

test('checksums distinguish content, not filenames', () => {
  assert.equal(checksumOf('SELECT 1'), checksumOf('SELECT 1'));
  assert.notEqual(checksumOf('SELECT 1'), checksumOf('SELECT 2'));
});
