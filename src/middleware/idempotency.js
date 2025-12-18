const { createClient } = require('redis');
const AppError = require('../utils/appError');

// Reuse existing Redis env or default
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = createClient({ url: redisUrl });

(async () => {
  try {
    await redis.connect();
    console.log('✅ Idempotency Redis connected');
  } catch (err) {
    console.warn('⚠️ Idempotency Redis failed (Feature disabled):', err.message);
  }
})();

exports.checkIdempotency = async (req, res, next) => {
  if (!redis.isOpen) return next(); // Fail open if Redis is down

  const key = req.headers['idempotency-key'];
  if (!key) return next(); // Skip if no key provided

  const idempotencyKey = `idempotency:${req.user.id}:${key}`;

  try {
    const exists = await redis.get(idempotencyKey);
    if (exists) {
      return next(new AppError('Duplicate request detected. Please wait.', 429));
    }

    // Lock for 60 seconds
    await redis.set(idempotencyKey, 'processing', { EX: 60 });
    next();
  } catch (err) {
    console.error('Idempotency error:', err);
    next();
  }
};
