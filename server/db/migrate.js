/**
 * Forward-only SQL migrations.
 *
 * The SQLite build had no migration system: schema changes were expressed as
 * `CREATE TABLE IF NOT EXISTS` plus hand-rolled rebuilds that dropped foreign
 * key enforcement to work around SQLite's ALTER limits. That is not a mechanism
 * anyone should attempt a tenancy column through, so versioned migrations land
 * first.
 *
 * Deliberate properties:
 * - **Plain .sql files.** No framework in the format, so moving to another
 *   runner later is a matter of pointing it at the same directory.
 * - **One transaction for the whole run.** A failed migration leaves the
 *   database exactly as it was, rather than half-migrated.
 * - **A transaction-scoped advisory lock.** Several instances booting at once -
 *   the normal case on a serverless platform - would otherwise race to apply
 *   the same file. Transaction scope (not session scope) is required because
 *   Neon's pooled endpoint runs PgBouncer in transaction mode, where a
 *   session-scoped lock would be released onto the wrong connection.
 * - **Checksums.** An already-applied file that changed on disk means two
 *   environments silently disagree about their schema, so the run stops.
 */
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

// Any constant works; it only has to be the same in every instance.
const ADVISORY_LOCK_KEY = 8_154_113_002_271_553n;

const checksumOf = (contents) => crypto.createHash('sha256').update(contents).digest('hex');

/** Migration files in lexical order, which is why they are numerically named. */
async function readMigrations(dir = MIGRATIONS_DIR) {
  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const files = entries.filter((name) => name.endsWith('.sql')).sort();
  return Promise.all(files.map(async (name) => {
    const contents = await fs.readFile(path.join(dir, name), 'utf8');
    return { version: name, contents, checksum: checksumOf(contents) };
  }));
}

/**
 * Applies every migration the database has not seen.
 * Returns the versions applied by this call, which is empty on a warm start.
 */
async function migrate(pool, { dir = MIGRATIONS_DIR, logger = console } = {}) {
  const migrations = await readMigrations(dir);
  const client = await pool.connect();
  const applied = [];

  try {
    await client.query('BEGIN');
    // Held until COMMIT or ROLLBACK; concurrent booters queue here and then
    // find there is nothing left to do.
    await client.query('SELECT pg_advisory_xact_lock($1)', [String(ADVISORY_LOCK_KEY)]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     text PRIMARY KEY,
        checksum    text NOT NULL,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query('SELECT version, checksum FROM schema_migrations');
    const known = new Map(rows.map((row) => [row.version, row.checksum]));

    for (const migration of migrations) {
      const knownChecksum = known.get(migration.version);

      if (knownChecksum && knownChecksum !== migration.checksum) {
        throw new Error(
          `Migration ${migration.version} has changed since it was applied. `
          + 'Applied migrations are immutable - add a new file instead.'
        );
      }
      if (knownChecksum) continue;

      await client.query(migration.contents);
      await client.query(
        'INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)',
        [migration.version, migration.checksum]
      );
      applied.push(migration.version);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  if (applied.length > 0) logger.log?.(`Applied ${applied.length} migration(s): ${applied.join(', ')}`);
  return applied;
}

module.exports = { migrate, readMigrations, checksumOf, MIGRATIONS_DIR };
