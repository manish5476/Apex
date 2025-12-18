const { getIo } = require('../utils/socket'); // Assuming your Redis client is accessible or create a getRedisClient util
// If you don't have a direct redis client export, you can use a simple memory cache or configure redis here.
// For this example, I will assume you have a redis util. If not, create src/utils/redisClient.js

const redis = require('../utils/redis'); // You need to ensure this exports your redis client

const cacheMiddleware = (duration = 300) => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') return next();

    const key = `cache:${req.originalUrl || req.url}`;

    try {
      const cachedResponse = await redis.get(key);
      
      if (cachedResponse) {
        return res.status(200).json(JSON.parse(cachedResponse));
      }

      // Intercept Response.send to cache it
      const originalSend = res.json;
      res.json = (body) => {
        // Cache for 'duration' seconds
        redis.setex(key, duration, JSON.stringify(body)).catch(err => console.error('Redis Cache Error:', err));
        originalSend.call(res, body);
      };

      next();
    } catch (err) {
      // If Redis fails, just proceed without caching. Don't crash the app.
      console.error('Redis Middleware Error:', err);
      next();
    }
  };
};

module.exports = cacheMiddleware;