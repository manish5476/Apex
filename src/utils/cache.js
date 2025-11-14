// src/utils/cache.js
const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const redis = new Redis(redisUrl, { lazyConnect: true });

redis.on('connect', () => console.log('Redis connected'));
redis.on('error', (err) => console.error('Redis error:', err.message));

/**
 * getCache / setCache for JSON payloads
 */
async function getCache(key) {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error('Cache read error', err.message);
    return null;
  }
}

async function setCache(key, value, ttlSeconds = 60) {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    console.error('Cache write error', err.message);
  }
}

async function delCache(key) {
  try {
    await redis.del(key);
  } catch (err) {
    console.error('Cache delete error', err.message);
  }
}

module.exports = { redis, getCache, setCache, delCache };
