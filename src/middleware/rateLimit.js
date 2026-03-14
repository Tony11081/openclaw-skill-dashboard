import rateLimit from 'express-rate-limit';

export const readRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.get('X-API-Key') || req.ip,
  message: {
    error: 'Too many requests. Please try again in a minute.'
  }
});

export const syncRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.get('X-Sync-Key') || req.ip,
  message: {
    error: 'Too many sync requests. Please slow down.'
  }
});
