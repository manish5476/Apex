// src/middlewares/cacheMiddleware.js

const { safeCache, isRedisAvailable } = require('../config/redis');

const cacheMiddleware = (duration = 300) => {
  return async (req, res, next) => {
    // Cache only GET requests
    if (req.method !== 'GET') return next();

    const key = `cache:${req.originalUrl || req.url}`;

    try {
      // Skip if Redis is unavailable
      const redisAvailable = await isRedisAvailable();
      if (!redisAvailable) return next();

      // Try cache lookup
      const cachedResponse = await safeCache.get(key);

      if (cachedResponse) {
        return res.status(200).json({
          ...cachedResponse,
          _meta: {
            cached: true,
            cacheKey: key,
            cachedAt: new Date().toISOString(),
          },
        });
      }

      // Intercept res.json to cache response
      const originalJson = res.json.bind(res);

      res.json = (body) => {
        // Cache response asynchronously (non-blocking)
        safeCache
          .set(key, body, duration)
          .catch(err =>
            console.error('🟡 Redis cache set error (ignored):', err.message)
          );

        return originalJson(body);
      };

      next();
    } catch (error) {
      // Redis failure should NEVER break API
      console.error('🟡 Cache middleware error (ignored):', error.message);
      next();
    }
  };
};

module.exports = cacheMiddleware;


// const { getRedisClient } = require("./redis");

// async function getCache(key) {
//   const client = getRedisClient();
//   if (!client) return null;

//   try {
//     const value = await client.get(key);
//     return value ? JSON.parse(value) : null;
//   } catch (err) {
//     console.error("Cache read error:", err.message);
//     return null;
//   }
// }

// async function setCache(key, value, ttl = 60) {
//   const client = getRedisClient();
//   if (!client) return;

//   try {
//     await client.set(key, JSON.stringify(value), "EX", ttl);
//     console.log(`📦 Cache set (TTL: ${ttl}s):`, key);
//   } catch (err) {
//     console.error("Cache write error:", err.message);
//   }
// }

// async function delCache(key) {
//   const client = getRedisClient();
//   if (!client) return;

//   try {
//     await client.del(key);
//   } catch (err) {
//     console.error("Cache delete error:", err.message);
//   }
// }

// module.exports = {
//   getCache,
//   setCache,
//   delCache
// };
