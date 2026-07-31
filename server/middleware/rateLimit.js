/**
 * Fixed-window limiter, keyed on caller + path.
 *
 * Expired records are swept rather than merely ignored: without that the map
 * grows once per distinct client address and never shrinks, so a caller
 * rotating source addresses could exhaust memory over a long-running process.
 */
const SWEEP_INTERVAL_MS = 60 * 1000;

function rateLimit({ windowMs, max, message = 'Too many requests. Please try again later.' }) {
  const attempts = new Map();
  let lastSweep = Date.now();

  const sweep = (now) => {
    for (const [key, record] of attempts) {
      if (record.resetAt <= now) attempts.delete(key);
    }
    lastSweep = now;
  };

  const middleware = (req, res, next) => {
    const now = Date.now();
    if (now - lastSweep >= SWEEP_INTERVAL_MS) sweep(now);

    const key = `${req.ip}:${req.path}`;
    const record = attempts.get(key);
    if (!record || record.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    record.count += 1;
    if (record.count > max) {
      res.setHeader('Retry-After', Math.ceil((record.resetAt - now) / 1000));
      return res.status(429).json({ success: false, message });
    }
    next();
  };

  // Exposed for tests; nothing in the request path depends on them.
  middleware.size = () => attempts.size;
  middleware.sweep = () => sweep(Date.now());
  return middleware;
}

module.exports = rateLimit;
