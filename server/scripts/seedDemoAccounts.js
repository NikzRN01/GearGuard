#!/usr/bin/env node
/**
 * Provisions one demo account per role, deliberately and by hand.
 *
 * Why this is a script and not part of startup seeding: seedDemoData is refused
 * outright in production because a server that silently creates accounts with a
 * published password gives anyone who reads this repository an administrator.
 * That guard stays exactly as it is. What was missing was a *supported* way to
 * put demo accounts on a demo deployment on purpose - an operator running a
 * command, once, knowing what it does. This is that command.
 *
 * The credentials it creates are public by design. Never run it against a
 * deployment holding real accounts or real data.
 *
 * Usage:
 *   node scripts/seedDemoAccounts.js            # create/update the demo accounts
 *   node scripts/seedDemoAccounts.js --reset    # remove every existing account first
 *
 * Environment:
 *   DATABASE_URL      required
 *   DEMO_PASSWORD     optional, defaults to Password123!
 */
const bcrypt = require('bcrypt');
const db = require('../database');
const { validatePassword } = require('../lib/validation');

const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Password123!';

/** Exactly one account per role the application understands. */
const ACCOUNTS = [
  { role: 'admin', email: 'admin@demo.com', name: 'Demo Admin' },
  { role: 'manager', email: 'manager@demo.com', name: 'Demo Manager' },
  { role: 'technician', email: 'technician@demo.com', name: 'Demo Technician' },
  { role: 'user', email: 'user@demo.com', name: 'Demo Requester' }
];

/**
 * Removes every account, and the rows that cannot outlive one.
 *
 * Order matters: maintenance_requests.created_by_user_id is NOT NULL and does
 * not cascade, so requests and their notes have to go before the users they
 * point at. audit_log.actor_user_id is ON DELETE SET NULL, so the trail itself
 * survives with its actors anonymised rather than being destroyed - deleting
 * the evidence of what happened would be the wrong default even here.
 */
async function resetAccounts() {
  return db.tx(async (trx) => {
    const removed = {};
    for (const [label, statement] of [
      ['notes', 'DELETE FROM notes'],
      ['maintenance_requests', 'DELETE FROM maintenance_requests'],
      ['team_members', 'DELETE FROM team_members'],
      ['sessions', 'DELETE FROM sessions'],
      ['password_reset_tokens', 'DELETE FROM password_reset_tokens'],
      ['users', 'DELETE FROM users']
    ]) {
      const result = await trx.run(statement);
      removed[label] = result.changes;
    }
    return removed;
  });
}

/** Creates or updates one account, so re-running is safe. */
async function upsertAccount({ role, email, name }, passwordHash) {
  await db.run(`
    INSERT INTO users (name, email, password, role)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (email) DO UPDATE
      SET name = EXCLUDED.name, password = EXCLUDED.password, role = EXCLUDED.role
  `, [name, email, passwordHash, role]);
}

async function main() {
  const reset = process.argv.includes('--reset');

  const passwordErrors = validatePassword(DEMO_PASSWORD);
  if (passwordErrors.length > 0) {
    console.error(`DEMO_PASSWORD is rejected by the account policy: ${passwordErrors.join('. ')}.`);
    process.exitCode = 1;
    return;
  }

  // The schema has to exist before anything can be written to it.
  await db.initializeDatabase();

  console.warn('');
  console.warn('  These accounts share one published password. Anyone who knows it is an');
  console.warn('  administrator. Use this only on a demo deployment.');
  console.warn('');

  if (reset) {
    const removed = await resetAccounts();
    const summary = Object.entries(removed)
      .filter(([, count]) => count > 0)
      .map(([table, count]) => `${count} ${table}`)
      .join(', ');
    console.log(`Removed: ${summary || 'nothing (already empty)'}`);
    console.log('Audit history was kept, with its actors anonymised.');
  }

  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  for (const account of ACCOUNTS) await upsertAccount(account, passwordHash);

  const rows = await db.all('SELECT email, role FROM users ORDER BY id');
  console.log('');
  console.log(`Accounts now in the database (${rows.length}):`);
  for (const row of rows) console.log(`  ${row.role.padEnd(11)} ${row.email}`);
  console.log('');
  console.log(`Password for all of them: ${DEMO_PASSWORD}`);
  console.log('');
}

main()
  .catch((error) => {
    console.error('Demo account seeding failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.close().catch(() => {}));
