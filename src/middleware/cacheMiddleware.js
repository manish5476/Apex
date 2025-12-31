const { getIo } = require('../utils/socket'); 
const redis = require('../utils/redis'); 

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
      const originalSend = res.json;
      res.json = (body) => {
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