function rateLimit({ windowMs, max, message = 'Too many requests. Please try again later.' }) {
  const attempts = new Map();
  return (req, res, next) => {
    const now = Date.now();
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
}

module.exports = rateLimit;
