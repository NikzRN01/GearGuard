/**
 * A small async query surface over a pg pool or client.
 *
 * The routes were written against better-sqlite3's synchronous
 * `prepare(sql).get/all/run(...)`. Rewriting every statement into pg's
 * `$1`-numbered form by hand would have touched 167 call sites and invited
 * off-by-one mistakes in the parameter lists, so `?` placeholders are converted
 * here instead and the SQL in each route stays readable and diffable.
 */

/**
 * Rewrites `?` placeholders as `$1..$n`.
 *
 * Quoting has to be tracked, or a `?` inside a string literal, a quoted
 * identifier, a comment, or a dollar-quoted block would be renumbered into a
 * parameter and corrupt the statement.
 */
function toNumberedPlaceholders(sql) {
  let out = '';
  let index = 0;
  let i = 0;

  while (i < sql.length) {
    const char = sql[i];

    // Line comment: -- ... end of line
    if (char === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? sql.length : end;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }

    // Block comment: /* ... */
    if (char === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }

    // Single-quoted literal, where '' is an escaped quote.
    if (char === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") { j += 1; break; }
        j += 1;
      }
      out += sql.slice(i, j);
      i = j;
      continue;
    }

    // Double-quoted identifier, where "" is an escaped quote.
    if (char === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === '"' && sql[j + 1] === '"') { j += 2; continue; }
        if (sql[j] === '"') { j += 1; break; }
        j += 1;
      }
      out += sql.slice(i, j);
      i = j;
      continue;
    }

    // Dollar-quoted block: $tag$ ... $tag$
    const dollarTag = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i));
    if (dollarTag) {
      const tag = dollarTag[0];
      const end = sql.indexOf(tag, i + tag.length);
      const stop = end === -1 ? sql.length : end + tag.length;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }

    if (char === '?') {
      index += 1;
      out += `$${index}`;
      i += 1;
      continue;
    }

    out += char;
    i += 1;
  }

  return out;
}

/** Builds the query helpers against anything with a pg-style `.query()`. */
function helpersFor(executor) {
  const query = (text, params = []) => executor.query(toNumberedPlaceholders(text), params);

  const all = async (text, params = []) => (await query(text, params)).rows;

  const get = async (text, params = []) => (await query(text, params)).rows[0];

  /** Mirrors better-sqlite3's `run()`: how many rows the statement touched. */
  const run = async (text, params = []) => {
    const result = await query(text, params);
    return { changes: result.rowCount ?? 0 };
  };

  /**
   * An INSERT that reports the new id.
   *
   * SQLite handed back `lastInsertRowid` for free; Postgres needs RETURNING, so
   * it is appended when the caller has not written one.
   */
  const insert = async (text, params = []) => {
    const returning = /\breturning\b/i.test(text) ? text : `${text} RETURNING id`;
    const row = (await query(returning, params)).rows[0];
    return { id: row?.id, row };
  };

  return { query, all, get, run, insert };
}

module.exports = { toNumberedPlaceholders, helpersFor };
