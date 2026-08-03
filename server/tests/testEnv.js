/**
 * Test environment, applied before the app is ever required.
 *
 * Must be the FIRST require in any test file that loads `../server` or
 * `../database`: both create the connection pool at import time, so anything
 * set afterwards arrives too late.
 *
 * Isolation model: `node --test` runs each file in its own process, and those
 * processes run concurrently against one PostgreSQL server. Each therefore gets
 * a uniquely named schema, created by the app on startup and dropped on the way
 * out. This replaces the per-file temporary SQLite file the suite used before
 * the move to PostgreSQL.
 *
 * Suites that need different settings (a tiny rate-limit ceiling, say) set them
 * after requiring this and before requiring the app.
 */
const crypto = require('crypto');

/** A schema name unique to this process. */
const testSchema = `test_${crypto.randomBytes(6).toString('hex')}`;

// 127.0.0.1 rather than localhost on purpose: localhost resolves to ::1 first
// on Windows, and Docker's published ports listen on IPv4 only, so the IPv6
// attempt hangs until the connection times out.
const DATABASE_URL = process.env.TEST_DATABASE_URL
  || process.env.DATABASE_URL
  || 'postgresql://gearguard:gearguard@127.0.0.1:55432/gearguard';

// dotenv never overrides variables that already exist, so setting these here
// also guarantees the developer's real Gmail credentials in server/.env are not
// picked up and no live mail is sent from a test run.
process.env.DATABASE_URL = DATABASE_URL;
process.env.DB_SCHEMA = testSchema;
process.env.NODE_ENV = 'test';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.MAIL_TRANSPORT = 'json';
process.env.CLIENT_URL = 'http://localhost:5173';

/** Drops this process's schema and closes the pool. Safe to call more than once. */
async function teardown(db) {
  try {
    await db.query(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE`);
  } catch {
    // A failed teardown must not turn a passing suite red; the schema name is
    // random, so the next run is unaffected either way.
  }
  await db.close().catch(() => {});
}

module.exports = { testSchema, DATABASE_URL, teardown };
