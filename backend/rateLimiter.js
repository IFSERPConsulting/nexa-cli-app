const { pool } = require('./users');

const rateLimits = new Map(); // userId -> { count, resetTime }

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS = 10; // per window

const checkRateLimit = (userId) => {
  const now = Date.now();
  const userLimit = rateLimits.get(userId);
  if (!userLimit || now > userLimit.resetTime) {
    rateLimits.set(userId, { count: 1, resetTime: now + WINDOW_MS });
    return true;
  }
  if (userLimit.count >= MAX_REQUESTS) {
    return false;
  }
  userLimit.count++;
  return true;
};

const rateLimitMiddleware = (action) => {
  return (req, res, next) => {
    if (!checkRateLimit(req.user.userId)) {
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    next();
  };
};

module.exports = { checkRateLimit, rateLimitMiddleware };