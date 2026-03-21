const Redis = require("ioredis");

// --- Configuration & State ---
let redisInstance = null;
let isInitialized = false;
let isEnabled = process.env.REDIS_ENABLED !== "false";

/**
 * Initialize Redis connection (Singleton)
 */
const initializeRedis = async () => {
    if (isInitialized) return redisInstance;
    isInitialized = true;
    
    if (!isEnabled) {
        console.log("🟡 Redis cache disabled via environment variable");
        return null;
    }

    try {
        const config = {
            host: process.env.REDIS_HOST || "localhost",
            port: parseInt(process.env.REDIS_PORT) || 6379,
            password: process.env.REDIS_PASSWORD || undefined,
            lazyConnect: true,
            retryStrategy: (times) => {
                if (times > 3) {
                    console.log("🟡 Redis connection failed after 3 attempts, disabling cache");
                    isEnabled = false; // Killswitch if server is down
                    return null;
                }
                return Math.min(times * 100, 3000);
            },
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
            showFriendlyErrorStack: process.env.NODE_ENV === "development",
        };

        // Use URL if provided, otherwise host/port
        redisInstance = process.env.REDIS_URL 
            ? new Redis(process.env.REDIS_URL, config) 
            : new Redis(config);

        redisInstance.on("error", (err) => console.log(`🟡 Redis Error: ${err.message}`));
        redisInstance.on("connect", () => console.log("✅ Redis connected"));

        await redisInstance.connect();
        return redisInstance;
    } catch (error) {
        console.log(`🟡 Redis Init Error: ${error.message}`);
        isEnabled = false;
        return null;
    }
};

/**
 * Helper to get the active Redis client
 */
const getRedis = async () => {
    if (!isEnabled) return null;
    if (redisInstance && redisInstance.status === "ready") return redisInstance;
    return await initializeRedis();
};

// --- Safe Cache Operations ---
const safeCache = {
    get: async (key) => {
        try {
            const redis = await getRedis();
            if (!redis) return null;
            const cached = await redis.get(key);
            return cached ? JSON.parse(cached) : null;
        } catch (err) {
            return null;
        }
    },

    set: async (key, data, ttl = 300) => {
        try {
            const redis = await getRedis();
            if (!redis) return false;
            // Store as JSON string
            await redis.setex(key, ttl, JSON.stringify(data));
            return true;
        } catch (err) {
            return false;
        }
    },

    clear: async (pattern) => {
        try {
            const redis = await getRedis();
            if (!redis) return 0;
            const keys = await redis.keys(pattern);
            if (keys.length > 0) await redis.del(...keys);
            return keys.length;
        } catch (err) {
            return 0;
        }
    }
};

// --- The Middleware ---


/**
 * Express Middleware to cache GET requests
 * @param {number} duration - Cache TTL in seconds
 */
const cacheMiddleware = (duration = 300) => {
    return async (req, res, next) => {
        if (req.method !== 'GET' || !isEnabled) return next();

        const key = `cache:${req.originalUrl || req.url}`;

        try {
            const cachedData = await safeCache.get(key);
            
            if (cachedData) {
                return res.status(200).json({
                    ...cachedData,
                    _meta: { cached: true, key, timestamp: new Date().toISOString() }
                });
            }

            // Intercept res.json to save the response to cache before sending
            const originalJson = res.json.bind(res);
            res.json = (body) => {
                // Only cache successful responses (2xx)
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    safeCache.set(key, body, duration).catch(() => {});
                }
                return originalJson(body);
            };

            next();
        } catch (err) {
            next(); // Fail gracefully
        }
    };
};

module.exports = {
    initializeRedis,
    safeCache,
    cacheMiddleware,
    isEnabled: () => isEnabled
};


// // src\core\utils\_legacy\redis.js
// const Redis = require("ioredis");

// // Singleton Redis instance
// let redisInstance = null;
// let isInitialized = false;
// let isEnabled = process.env.REDIS_ENABLED !== "false";

// /**
//  * Initialize Redis connection
//  */
// const initializeRedis = async () => {
//     if (isInitialized) return redisInstance;
    
//     isInitialized = true;
    
//     if (!isEnabled) {
//         console.log("🟡 Redis cache disabled via environment variable");
//         return null;
//     }

//     try {
//         const redisUrl = process.env.REDIS_URL;
//         const config = {};

//         if (redisUrl) {
//             // Use REDIS_URL if provided
//             console.log(`🟡 Connecting to Redis via URL: ${redisUrl}`);
//             config.lazyConnect = true;
//         } else {
//             // Fallback to individual host/port
//             const host = process.env.REDIS_HOST || "localhost";
//             const port = parseInt(process.env.REDIS_PORT) || 6379;
//             console.log(`🟡 Connecting to Redis at ${host}:${port}`);
            
//             config.host = host;
//             config.port = port;
//             config.lazyConnect = true;
//         }

//         // Common configuration
//         Object.assign(config, {
//             retryStrategy: (times) => {
//                 if (times > 3) {
//                     console.log("🟡 Redis connection failed after 3 attempts, disabling cache");
//                     return null;
//                 }
//                 return Math.min(times * 100, 3000);
//             },
//             maxRetriesPerRequest: 1,
//             enableOfflineQueue: false,
//             showFriendlyErrorStack: process.env.NODE_ENV === "development",
//             // Optional password
//             ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD })
//         });

//         redisInstance = redisUrl ? new Redis(redisUrl, config) : new Redis(config);

//         // Event handlers
//         redisInstance.on("connect", () => {
//             console.log("✅ Redis connected successfully");
//         });

//         redisInstance.on("error", (error) => {
//             console.log(`🟡 Redis error: ${error.message}`);
//             redisInstance = null;
//         });

//         redisInstance.on("close", () => {
//             console.log("🟡 Redis connection closed");
//             redisInstance = null;
//         });

//         // Attempt to connect
//         await redisInstance.connect();
//         await redisInstance.ping();
        
//         console.log("✅ Redis ping successful");
//         return redisInstance;

//     } catch (error) {
//         console.log(`🟡 Redis initialization error: ${error.message}`);
//         console.log("🟡 Continuing without Redis cache");
//         redisInstance = null;
//         isEnabled = false;
//         return null;
//     }
// };

// /**
//  * Get Redis instance (singleton)
//  */
// const getRedis = async () => {
//     if (!isEnabled) return null;
//     if (redisInstance && redisInstance.status === "ready") return redisInstance;
    
//     return await initializeRedis();
// };

// /**
//  * Check if Redis is available
//  */
// const isRedisAvailable = async () => {
//     const redis = await getRedis();
//     return redis !== null && redis.status === "ready";
// };

// /**
//  * Safe cache operations
//  */
// const safeCache = {
//     set: async (key, data, ttl = 300) => {
//         try {
//             const redis = await getRedis();
//             if (!redis) return false;

//             await redis.setex(
//                 key,
//                 ttl,
//                 JSON.stringify({
//                     data,
//                     cachedAt: Date.now(),
//                 }),
//             );
//             return true;
//         } catch (error) {
//             console.log(`🟡 Cache set error (ignored): ${error.message}`);
//             return false;
//         }
//     },

//     get: async (key) => {
//         try {
//             const redis = await getRedis();
//             if (!redis) return null;

//             const cached = await redis.get(key);
//             if (cached) {
//                 const parsed = JSON.parse(cached);
//                 // Check if cache is still valid (default 5 minutes)
//                 const age = Date.now() - parsed.cachedAt;
//                 if (age < 300000) {
//                     return parsed.data;
//                 }
//             }
//             return null;
//         } catch (error) {
//             console.log(`🟡 Cache get error (ignored): ${error.message}`);
//             return null;
//         }
//     },

//     clear: async (pattern) => {
//         try {
//             const redis = await getRedis();
//             if (!redis) return 0;

//             const keys = await redis.keys(pattern);
//             if (keys.length > 0) {
//                 await redis.del(...keys);
//             }
//             return keys.length;
//         } catch (error) {
//             console.log(`🟡 Cache clear error (ignored): ${error.message}`);
//             return 0;
//         }
//     },
    
//     // Additional utility methods
//     delete: async (key) => {
//         try {
//             const redis = await getRedis();
//             if (!redis) return false;
//             await redis.del(key);
//             return true;
//         } catch (error) {
//             console.log(`🟡 Cache delete error (ignored): ${error.message}`);
//             return false;
//         }
//     },
    
//     exists: async (key) => {
//         try {
//             const redis = await getRedis();
//             if (!redis) return false;
//             return (await redis.exists(key)) === 1;
//         } catch (error) {
//             console.log(`🟡 Cache exists error (ignored): ${error.message}`);
//             return false;
//         }
//     },
    
//     ttl: async (key) => {
//         try {
//             const redis = await getRedis();
//             if (!redis) return -2; // Key doesn't exist
//             return await redis.ttl(key);
//         } catch (error) {
//             console.log(`🟡 Cache TTL error (ignored): ${error.message}`);
//             return -2;
//         }
//     }
// };

// /**
//  * Cache middleware for Express
//  */
// const cacheMiddleware = (duration = 300) => {
//     return async (req, res, next) => {
//         // Only cache GET requests
//         if (req.method !== 'GET') return next();

//         const key = `cache:${req.originalUrl || req.url}`;

//         try {
//             const cachedResponse = await safeCache.get(key);
            
//             if (cachedResponse) {
//                 console.log(`✅ Cache hit: ${key}`);
//                 return res.status(200).json({
//                     ...cachedResponse,
//                     _meta: {
//                         cached: true,
//                         timestamp: new Date().toISOString()
//                     }
//                 });
//             }

//             // Intercept Response.json to cache it
//             const originalJson = res.json;
//             res.json = (body) => {
//                 // Cache for 'duration' seconds
//                 safeCache.set(key, body, duration)
//                     .then(success => {
//                         if (success) console.log(`✅ Cached: ${key} for ${duration}s`);
//                     })
//                     .catch(err => console.error('Cache Error:', err.message));
                
//                 return originalJson.call(res, body);
//             };

//             next();
//         } catch (err) {
//             // If Redis fails, just proceed without caching
//             console.error('Cache Middleware Error:', err.message);
//             next();
//         }
//     };
// };

// /**
//  * Initialize Redis on app startup
//  */
// const initRedisOnStartup = async () => {
//     if (isEnabled) {
//         console.log("🔄 Initializing Redis on startup...");
//         await initializeRedis();
//     }
// };

// module.exports = {
//     // Core functions
//     getRedis,
//     isRedisAvailable,
//     initializeRedis: initRedisOnStartup,
    
//     // Cache operations
//     safeCache,
    
//     // Middleware
//     cacheMiddleware,
    
//     // Configuration
//     REDIS_ENABLED: isEnabled,
    
//     // Utility functions
//     clearAllAnalyticsCache: async () => {
//         return await safeCache.clear('analytics:*');
//     },
    
//     clearDashboardCache: async (orgId, branchId) => {
//         const pattern = `analytics:dashboard:${orgId}:${branchId || '*'}:*`;
//         return await safeCache.clear(pattern);
//     },
    
//     // Health check
//     healthCheck: async () => {
//         try {
//             const redis = await getRedis();
//             if (!redis) {
//                 return {
//                     status: 'disabled',
//                     message: 'Redis is disabled or not available'
//                 };
//             }
            
//             const ping = await redis.ping();
//             const info = await redis.info();
//             const keys = await redis.dbsize();
            
//             return {
//                 status: 'healthy',
//                 ping: ping === 'PONG',
//                 keys,
//                 version: info.split('\n')[0].split(':')[1].trim(),
//                 uptime: info.match(/uptime_in_seconds:(\d+)/)?.[1] || 'unknown',
//                 memory: info.match(/used_memory_human:([\d.]+[KMG]B)/)?.[1] || 'unknown'
//             };
//         } catch (error) {
//             return {
//                 status: 'error',
//                 message: error.message
//             };
//         }
//     }
// };
