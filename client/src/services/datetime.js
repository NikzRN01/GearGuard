/**
 * Dates as the API actually sends them.
 *
 * SQLite's CURRENT_TIMESTAMP produces "YYYY-MM-DD HH:MM:SS" in **UTC**, with no
 * offset marker. That string is not valid ISO 8601, so `new Date(value)` falls
 * back to the engine's own parsing and reads it as *local* time - silently
 * shifting every timestamp in the UI by the viewer's offset (5h30m in IST, and
 * enough to show the wrong calendar day either side of midnight).
 *
 * Date-only columns have the opposite problem: `new Date('2026-03-04')` is
 * parsed as UTC midnight by spec, which renders as the 3rd anywhere west of
 * Greenwich. Those must be built from their parts in local time instead.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** A UTC timestamp from the API, as a Date. Returns null for anything unusable. */
export function parseTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const text = String(value).trim();
  // Already carries a zone (ISO with Z or +hh:mm): trust it as-is.
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
  const normalised = hasZone
    ? text.replace(' ', 'T')
    : DATE_ONLY.test(text)
      ? `${text}T00:00:00Z`
      : `${text.replace(' ', 'T')}Z`;

  const date = new Date(normalised);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A date-only column ("YYYY-MM-DD"), as local midnight on that calendar day. */
export function parseDateOnly(value) {
  if (!value) return null;
  const key = String(value).slice(0, 10);
  if (!DATE_ONLY.test(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "YYYY-MM-DD" for a Date, in the viewer's own timezone. */
export function toDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export const todayKey = () => toDateKey();

/** The calendar day of a UTC timestamp, in the viewer's timezone. */
export function formatTimestampDate(value, fallback = '—') {
  const date = parseTimestamp(value);
  return date ? date.toLocaleDateString() : fallback;
}

/** Full date and time of a UTC timestamp, in the viewer's timezone. */
export function formatTimestamp(value, fallback = '—') {
  const date = parseTimestamp(value);
  return date ? date.toLocaleString() : fallback;
}

/** A date-only column rendered as a calendar day, with no timezone shift. */
export function formatDateOnly(value, fallback = '—', options) {
  const date = parseDateOnly(value);
  return date ? date.toLocaleDateString(undefined, options) : fallback;
}
