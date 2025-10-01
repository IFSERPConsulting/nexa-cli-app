// ...existing code...
// Note: removed unused DB pool import.

const rateLimits = new Map(); // userId -> { count, resetTime }

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000; // window in ms
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 10; // per window

const checkRateLimit = (userId) => {
  const now = Date.now();
  const userLimit = rateLimits.get(userId);
  if (!userLimit || now > userLimit.resetTime) {
    rateLimits.set(userId, { count: 1, resetTime: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS - 1, resetTime: now + WINDOW_MS };
  }
  if (userLimit.count >= MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetTime: userLimit.resetTime };
  }
  userLimit.count++;
  return { allowed: true, remaining: MAX_REQUESTS - userLimit.count, resetTime: userLimit.resetTime };
};

const rateLimitMiddleware = (action) => {
  return (req, res, next) => {
    if (!req.user || !req.user.userId) {
      // Authentication should run before this middleware; return 401 if missing
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { allowed, remaining, resetTime } = checkRateLimit(req.user.userId);
    const now = Date.now();
    const retryAfterSec = Math.max(0, Math.ceil((resetTime - now) / 1000));

    // Common RateLimit headers
    res.setHeader('X-RateLimit-Limit', String(MAX_REQUESTS));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.floor(resetTime / 1000)));

    if (!allowed) {
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: 'Rate limit exceeded', retry_after_seconds: retryAfterSec });
    }
    next();
  };
};

module.exports = { checkRateLimit, rateLimitMiddleware };