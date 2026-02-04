// 1. Change the import to point to your new config file
//    and destructure 'safeCache' from it.
const { safeCache } = require("../utils/_legacy/redis"); 

const cacheMiddleware = (duration = 300) => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== "GET") return next();

    const key = `cache:${req.originalUrl || req.url}`;

    try {
      // 2. Use safeCache.get()
      // NOTE: safeCache.get returns the actual OBJECT, not a string.
      const cachedResponse = await safeCache.get(key);

      if (cachedResponse) {
        // 3. Remove JSON.parse(). 'cachedResponse' is already an object.
        return res.status(200).json(cachedResponse);
      }

      const originalSend = res.json;
      res.json = (body) => {
        // 4. Use safeCache.set()
        // NOTE: safeCache.set handles JSON.stringify internally.
        //       It also wraps the data with a timestamp.
        safeCache
          .set(key, body, duration)
          .catch((err) => console.error("Redis Cache Error:", err));
        
        originalSend.call(res, body);
      };

      next();
    } catch (err) {
      // If Redis fails, just proceed without caching. Don't crash the app.
      console.error("Redis Middleware Error:", err);
      next();
    }
  };
};

module.exports = cacheMiddleware;
// const { getIo } = require("../utils/_legacy/socket");
// const redis = require("../utils/_legacy/redis");

// const cacheMiddleware = (duration = 300) => {
//   return async (req, res, next) => {
//     // Only cache GET requests
//     if (req.method !== "GET") return next();

//     const key = `cache:${req.originalUrl || req.url}`;

//     try {
//       const cachedResponse = await redis.get(key);

//       if (cachedResponse) {
//         return res.status(200).json(JSON.parse(cachedResponse));
//       }
//       const originalSend = res.json;
//       res.json = (body) => {
//         redis
//           .setex(key, duration, JSON.stringify(body))
//           .catch((err) => console.error("Redis Cache Error:", err));
//         originalSend.call(res, body);
//       };

//       next();
//     } catch (err) {
//       // If Redis fails, just proceed without caching. Don't crash the app.
//       console.error("Redis Middleware Error:", err);
//       next();
//     }
//   };
// };

// module.exports = cacheMiddleware;
