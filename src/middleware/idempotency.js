const { createClient } = require('redis');
const AppError = require('../utils/appError');

const redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redis.connect().catch(console.error);

exports.checkIdempotency = async (req, res, next) => {
  const key = req.headers['idempotency-key'];

  // 1. Skip if no key provided (Optional: or enforce it for sensitive routes)
  if (!key) return next();

  const idempotencyKey = `idempotency:${req.user.id}:${key}`;

  // 2. Check if key exists
  const exists = await redis.get(idempotencyKey);

  if (exists) {
    return next(new AppError('Duplicate request detected. Please wait a moment.', 429));
  }

  // 3. Lock this key for 30 seconds (Enough time to process payment)
  await redis.set(idempotencyKey, 'processing', { EX: 30 });

  next();
};
