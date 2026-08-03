/**
 * The PostgreSQL connection pool.
 *
 * Replaces the single-file SQLite database, which could not survive more than
 * one instance: on Vercel it lived in /tmp and was wiped on every cold start.
 *
 * Neon notes, since that is the intended host:
 * - Neon offers two endpoints per branch. The direct one (`ep-xxx.region...`)
 *   keeps a real session; the pooled one (`ep-xxx-pooler.region...`) fronts
 *   PgBouncer in transaction mode. Transaction pooling drops anything with
 *   session lifetime between statements, which is why the migration runner uses
 *   a transaction-scoped advisory lock rather than a session-scoped one.
 * - Neon suspends an idle branch. The first query after a suspend pays a cold
 *   start of a second or two, so connectionTimeoutMillis has to allow for it.
 */
const { Pool, types } = require('pg');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Return bigint (OID 20) as a JavaScript number.
 *
 * node-postgres hands int8 back as a *string* by default, because a 64-bit
 * integer can exceed Number.MAX_SAFE_INTEGER. That default is wrong for this
 * schema and actively dangerous: every COUNT(*) is int8, so `total + row.count`
 * would concatenate strings rather than add, and a paging `total` would arrive
 * as "42". No column here is bigint - identifiers are `integer` - so the only
 * int8 values in play are aggregate counts, which cannot approach the safe
 * range. Revisit this if a genuine bigint column is ever added.
 */
types.setTypeParser(20, (value) => (value === null ? null : Number(value)));

/**
 * Return `date` (OID 1082) as the plain 'YYYY-MM-DD' string Postgres sent.
 *
 * By default node-postgres turns a date into a JavaScript Date at *local*
 * midnight. Serialising that to JSON converts it to UTC, so in any timezone
 * east of Greenwich `2024-02-02` leaves the API as `2024-02-01T18:30:00.000Z` -
 * the wrong calendar day, and a shape the client never expected.
 *
 * A calendar date has no time and no zone. scheduled_date, purchase_date and
 * warranty_end_date are all dates in that sense, so the honest representation
 * is the string, which is also exactly what the SQLite build returned and what
 * the client already parses (see client/src/services/datetime.js).
 */
types.setTypeParser(1082, (value) => value);

/** The sslmode from the connection string, if it carries one. */
const sslModeOf = (connectionString) =>
  /[?&]sslmode=([^&]+)/i.exec(connectionString || '')?.[1]?.toLowerCase() || null;

/**
 * TLS settings for a connection string.
 *
 * node-postgres does not honour `sslmode` on its own, so a managed database
 * would silently connect in the clear if this were left to the URL. Anything
 * not on loopback therefore gets TLS with certificate verification; Neon,
 * Supabase and RDS all chain to public roots, so verification costs nothing.
 * `sslmode=no-verify` exists for self-signed hosts and is the only way to turn
 * verification off.
 */
function sslFor(connectionString) {
  const mode = sslModeOf(connectionString);
  if (mode === 'disable') return false;

  let host = '';
  try {
    host = new URL(connectionString).hostname;
  } catch {
    host = '';
  }

  if (LOCAL_HOSTS.has(host) && !mode) return false;
  if (mode === 'no-verify' || mode === 'prefer') return { rejectUnauthorized: false };
  return { rejectUnauthorized: true };
}

/**
 * The schema this instance lives in, or null for the connection's default.
 *
 * Deploying several environments into one database - staging beside production,
 * or a schema per test process - is a normal arrangement, and it is the only
 * way the test suite can run files concurrently against a single server. The
 * name is validated because it is interpolated into DDL, where it cannot be a
 * bound parameter.
 */
function schemaName(value = process.env.DB_SCHEMA) {
  const name = String(value || '').trim();
  if (!name) return null;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`DB_SCHEMA must be a plain identifier, got: ${name}`);
  }
  return name;
}

function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. GearGuard needs a PostgreSQL connection string '
      + '(for example a Neon branch URL). See server/.env.example.'
    );
  }

  const schema = schemaName();

  // A transaction-pooling proxy multiplexes many clients onto few server
  // connections, so it refuses startup parameters that would outlive a single
  // transaction - search_path among them. Neon answers this with SQLSTATE 08P01
  // and a message that only appears once a query is attempted, which is a poor
  // way to learn about it. Say so up front instead.
  //
  // Only schema-scoped deployments are affected. Production runs in the default
  // schema, sends no options, and is happy on the pooled endpoint.
  if (schema && /-pooler\./.test(connectionString)) {
    throw new Error(
      `DB_SCHEMA=${schema} cannot be used with a connection-pooling endpoint. `
      + 'Use the direct endpoint instead (drop "-pooler" from the host), or unset DB_SCHEMA '
      + 'to run in the default schema.'
    );
  }

  const pool = new Pool({
    connectionString,
    // Applied to every connection the pool opens, including replacements for
    // ones the server drops. Written without a space after -c: libpq treats a
    // space here as an argument separator and the startup packet is rejected.
    options: schema ? `-csearch_path=${schema},public` : undefined,
    ssl: sslFor(connectionString),
    // Serverless platforms run many short-lived instances, so each one should
    // hold few connections. Neon's own limit is per-branch, not per-instance.
    max: Number(process.env.PGPOOL_MAX) || 10,
    idleTimeoutMillis: Number(process.env.PGPOOL_IDLE_MS) || 30_000,
    // Generous enough to cover a Neon branch waking from suspend.
    connectionTimeoutMillis: Number(process.env.PGPOOL_CONNECT_MS) || 10_000
  });

  // An idle client can fail without any query in flight - a server restart, or
  // Neon suspending the branch. Without this listener the error would reach
  // process level and take the instance down.
  pool.on('error', (error) => {
    console.error('Idle PostgreSQL client error:', error.message);
  });

  return pool;
}

module.exports = { createPool, sslFor, sslModeOf, schemaName };
