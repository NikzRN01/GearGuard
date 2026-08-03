/**
 * Request validation helpers.
 *
 * Routes throw HttpError; the central error handler in server.js turns it into
 * a JSON response. Anything that reaches the handler without being an HttpError
 * is treated as an unexpected fault and reported as a generic 500, so internal
 * details (SQL text, file paths, stack traces) never reach a client.
 */

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.expose = true;
  }
}

const badRequest = (message) => new HttpError(400, message);
const unauthorized = (message) => new HttpError(401, message);
const notFound = (message) => new HttpError(404, message);
const conflict = (message) => new HttpError(409, message);
const forbidden = (message) => new HttpError(403, message);

/** Field length caps, so a client cannot bloat the database with one request. */
const LIMITS = {
  name: 200,
  email: 254,
  subject: 300,
  note: 2000,
  code: 60,
  tag: 60,
  shortText: 200,
  password: 200
};

const isPlainValue = (value) =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value);

/**
 * Characters that are never meaningful content but are routinely used to make
 * stored text lie about itself: NUL (truncates the value for anything that
 * reads it as a C string) and the Unicode bidirectional overrides, which can
 * reverse how a name renders without changing what is compared. Tab, newline
 * and carriage return are deliberately kept - notes are multi-line.
 */
// eslint-disable-next-line no-control-regex
const UNSAFE_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

const stripUnsafe = (value) => value.replace(UNSAFE_TEXT, '');

/**
 * A required, non-blank string. Objects and arrays are rejected outright rather
 * than being stringified into the database.
 */
function requiredString(value, field, max = LIMITS.shortText) {
  if (value === undefined || value === null || value === '') {
    throw badRequest(`${field} is required`);
  }
  if (typeof value !== 'string') {
    throw badRequest(`${field} must be text`);
  }
  const trimmed = stripUnsafe(value).trim();
  if (!trimmed) throw badRequest(`${field} cannot be blank`);
  if (trimmed.length > max) {
    throw badRequest(`${field} must be ${max} characters or fewer`);
  }
  return trimmed;
}

/**
 * An optional string. `undefined` means "not supplied" (returns undefined);
 * null or '' means "clear this value" (returns null).
 */
function optionalString(value, field, max = LIMITS.shortText) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw badRequest(`${field} must be text`);
  }
  const trimmed = stripUnsafe(value).trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw badRequest(`${field} must be ${max} characters or fewer`);
  }
  return trimmed;
}

/** A required positive integer id. */
function requiredId(value, field) {
  const id = toId(value);
  if (id === null) throw badRequest(`${field} must be a positive whole number`);
  return id;
}

/** An optional id: undefined stays undefined, null/'' becomes null. */
function optionalId(value, field) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const id = toId(value);
  if (id === null) throw badRequest(`${field} must be a positive whole number`);
  return id;
}

/** Parses a path parameter. Returns null for anything that is not a real id. */
function toId(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^[0-9]+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * A finite number within an inclusive range. Strings are accepted only when
 * they parse cleanly, so "free" or "" never reaches a REAL column.
 */
function optionalNumber(value, field, { min = -Infinity, max = Infinity } = {}) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (!isPlainValue(value) || typeof value === 'boolean') {
    throw badRequest(`${field} must be a number`);
  }
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(parsed)) {
    throw badRequest(`${field} must be a number`);
  }
  if (parsed < min || parsed > max) {
    const range = max === Infinity ? `at least ${min}` : `between ${min} and ${max}`;
    throw badRequest(`${field} must be ${range}`);
  }
  return parsed;
}

/**
 * An ISO calendar date (YYYY-MM-DD). Also accepts a full ISO timestamp and
 * keeps only the date part, which is all the schema stores.
 */
function optionalDate(value, field) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw badRequest(`${field} must be a date`);

  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:[T ].*)?$/);
  if (!match) throw badRequest(`${field} must be a date in YYYY-MM-DD format`);

  const datePart = match[1];
  const [year, month, day] = datePart.split('-').map(Number);
  const asDate = new Date(Date.UTC(year, month - 1, day));
  const roundTrips =
    asDate.getUTCFullYear() === year &&
    asDate.getUTCMonth() === month - 1 &&
    asDate.getUTCDate() === day;
  if (!roundTrips) throw badRequest(`${field} is not a real calendar date`);

  return datePart;
}

/** One of a fixed set of values. */
function optionalEnum(value, field, allowed) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw badRequest(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return value;
}

function requiredEnum(value, field, allowed) {
  const parsed = optionalEnum(value, field, allowed);
  if (parsed === undefined || parsed === null) {
    throw badRequest(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return parsed;
}

/** Escapes LIKE metacharacters so a search for "%" is a literal search. */
function likePattern(value) {
  return `%${String(value).replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/**
 * Wraps an async or sync route handler so thrown errors reach Express's error
 * pipeline instead of hanging the request or crashing the process.
 */
function route(handler) {
  return (req, res, next) => {
    try {
      const result = handler(req, res, next);
      if (result && typeof result.catch === 'function') result.catch(next);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * The account password policy, in one place.
 *
 * Signup, password reset and the first-admin bootstrap all enforce this. It
 * lives here rather than in authRoutes because database.js needs it too, and a
 * bootstrap admin created under weaker rules than the signup form would be a
 * hole the form is specifically there to close.
 */
function validatePassword(password) {
  const value = String(password ?? '');
  const errors = [];

  if (value.length < 8) errors.push('Password must be at least 8 characters long');
  if (!/[A-Z]/.test(value)) errors.push('Password must contain at least one uppercase letter');
  if (!/[a-z]/.test(value)) errors.push('Password must contain at least one lowercase letter');
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(value)) errors.push('Password must contain at least one special character');

  return errors;
}

/** PostgreSQL's unique_violation. */
const UNIQUE_VIOLATION = '23505';

/** True when a driver error is a UNIQUE constraint violation. */
const isUniqueViolation = (error) => error?.code === UNIQUE_VIOLATION;

module.exports = {
  HttpError,
  LIMITS,
  badRequest,
  unauthorized,
  notFound,
  conflict,
  forbidden,
  requiredString,
  optionalString,
  requiredId,
  optionalId,
  toId,
  optionalNumber,
  optionalDate,
  optionalEnum,
  requiredEnum,
  likePattern,
  route,
  validatePassword,
  isUniqueViolation
};
