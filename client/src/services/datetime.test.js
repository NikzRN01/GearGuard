import { describe, expect, it } from 'vitest';
import {
  formatDateOnly,
  formatTimestamp,
  formatTimestampDate,
  parseDateOnly,
  parseTimestamp,
  toDateKey,
  todayKey
} from './datetime';

/** The exact shape SQLite's CURRENT_TIMESTAMP produces: UTC, no offset marker. */
const sqlite = (iso) => iso.slice(0, 19).replace('T', ' ');

describe('parseTimestamp', () => {
  it('reads a SQLite timestamp as UTC, not as local time', () => {
    // The bug this guards: `new Date('2026-03-04 21:30:00')` is parsed as local
    // time, so the instant shifts by the viewer's offset.
    const value = sqlite('2026-03-04T21:30:00.000Z');
    expect(parseTimestamp(value).toISOString()).toBe('2026-03-04T21:30:00.000Z');
  });

  it('round-trips any instant through the SQLite text format', () => {
    for (const iso of [
      '2026-01-01T00:00:00.000Z',
      '2026-06-30T23:59:59.000Z',
      '2025-12-31T18:45:12.000Z'
    ]) {
      expect(parseTimestamp(sqlite(iso)).toISOString()).toBe(iso);
    }
  });

  it('leaves a value that already carries a zone alone', () => {
    expect(parseTimestamp('2026-03-04T21:30:00Z').toISOString()).toBe('2026-03-04T21:30:00.000Z');
    expect(parseTimestamp('2026-03-04T21:30:00+05:30').toISOString()).toBe('2026-03-04T16:00:00.000Z');
  });

  it('treats a bare date as UTC midnight', () => {
    expect(parseTimestamp('2026-03-04').toISOString()).toBe('2026-03-04T00:00:00.000Z');
  });

  it('returns null rather than an Invalid Date', () => {
    for (const value of [null, undefined, '', 'not a date', {}, NaN]) {
      expect(parseTimestamp(value)).toBeNull();
    }
  });

  it('accepts a Date it is handed back', () => {
    const date = new Date('2026-03-04T21:30:00Z');
    expect(parseTimestamp(date)).toBe(date);
    expect(parseTimestamp(new Date('nope'))).toBeNull();
  });
});

describe('parseDateOnly', () => {
  it('lands on the same calendar day the API sent, in local time', () => {
    // `new Date('2026-03-04')` is UTC midnight, which renders as the 3rd
    // anywhere west of Greenwich. This must not.
    const date = parseDateOnly('2026-03-04');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(2);
    expect(date.getDate()).toBe(4);
    expect(date.getHours()).toBe(0);
  });

  it('ignores a time part the column should not have', () => {
    expect(toDateKey(parseDateOnly('2026-03-04T23:00:00'))).toBe('2026-03-04');
  });

  it('rejects anything that is not a calendar date', () => {
    for (const value of [null, '', 'tomorrow', '04-03-2026', '2026-3-4']) {
      expect(parseDateOnly(value)).toBeNull();
    }
  });
});

describe('toDateKey / todayKey', () => {
  it('formats a Date as its local calendar day', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toDateKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('agrees with the current local day', () => {
    const now = new Date();
    expect(todayKey()).toBe(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    );
  });

  it('round-trips a date-only column', () => {
    expect(toDateKey(parseDateOnly('2026-07-31'))).toBe('2026-07-31');
  });
});

describe('formatters', () => {
  it('renders a timestamp on the viewer local day of the real instant', () => {
    const instant = new Date('2026-03-04T21:30:00Z');
    expect(formatTimestampDate(sqlite(instant.toISOString()))).toBe(instant.toLocaleDateString());
    expect(formatTimestamp(sqlite(instant.toISOString()))).toBe(instant.toLocaleString());
  });

  it('renders a date-only column without shifting the day', () => {
    expect(formatDateOnly('2026-03-04')).toBe(new Date(2026, 2, 4).toLocaleDateString());
  });

  it('uses the caller fallback for missing values', () => {
    expect(formatTimestampDate(null)).toBe('—');
    expect(formatTimestamp(null, '')).toBe('');
    expect(formatDateOnly(null, 'Not scheduled')).toBe('Not scheduled');
    expect(formatDateOnly('garbage', 'Not scheduled')).toBe('Not scheduled');
  });
});
