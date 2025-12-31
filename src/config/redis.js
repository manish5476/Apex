// src/config/redis.js - Unified Redis Configuration
const Redis = require("ioredis");

// Singleton Redis instance
let redisInstance = null;
let isInitialized = false;
let isEnabled = process.env.REDIS_ENABLED !== "false";

/**
 * Initialize Redis connection
 */
const initializeRedis = async () => {
    if (isInitialized) return redisInstance;
    
    isInitialized = true;
    
    if (!isEnabled) {
        console.log("🟡 Redis cache disabled via environment variable");
        return null;
    }

    try {
        const redisUrl = process.env.REDIS_URL;
        const config = {};

        if (redisUrl) {
            // Use REDIS_URL if provided
            console.log(`🟡 Connecting to Redis via URL: ${redisUrl}`);
            config.lazyConnect = true;
        } else {
            // Fallback to individual host/port
            const host = process.env.REDIS_HOST || "localhost";
            const port = parseInt(process.env.REDIS_PORT) || 6379;
            console.log(`🟡 Connecting to Redis at ${host}:${port}`);
            
            config.host = host;
            config.port = port;
            config.lazyConnect = true;
        }

        // Common configuration
        Object.assign(config, {
            retryStrategy: (times) => {
                if (times > 3) {
                    console.log("🟡 Redis connection failed after 3 attempts, disabling cache");
                    return null;
                }
                return Math.min(times * 100, 3000);
            },
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
            showFriendlyErrorStack: process.env.NODE_ENV === "development",
            // Optional password
            ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD })
        });

        redisInstance = redisUrl ? new Redis(redisUrl, config) : new Redis(config);

        // Event handlers
        redisInstance.on("connect", () => {
            console.log("✅ Redis connected successfully");
        });

        redisInstance.on("error", (error) => {
            console.log(`🟡 Redis error: ${error.message}`);
            redisInstance = null;
        });

        redisInstance.on("close", () => {
            console.log("🟡 Redis connection closed");
            redisInstance = null;
        });

        // Attempt to connect
        await redisInstance.connect();
        await redisInstance.ping();
        
        console.log("✅ Redis ping successful");
        return redisInstance;

    } catch (error) {
        console.log(`🟡 Redis initialization error: ${error.message}`);
        console.log("🟡 Continuing without Redis cache");
        redisInstance = null;
        isEnabled = false;
        return null;
    }
};

/**
 * Get Redis instance (singleton)
 */
const getRedis = async () => {
    if (!isEnabled) return null;
    if (redisInstance && redisInstance.status === "ready") return redisInstance;
    
    return await initializeRedis();
};

/**
 * Check if Redis is available
 */
const isRedisAvailable = async () => {
    const redis = await getRedis();
    return redis !== null && redis.status === "ready";
};

/**
 * Safe cache operations
 */
const safeCache = {
    set: async (key, data, ttl = 300) => {
        try {
            const redis = await getRedis();
            if (!redis) return false;

            await redis.setex(
                key,
                ttl,
                JSON.stringify({
                    data,
                    cachedAt: Date.now(),
                }),
            );
            return true;
        } catch (error) {
            console.log(`🟡 Cache set error (ignored): ${error.message}`);
            return false;
        }
    },

    get: async (key) => {
        try {
            const redis = await getRedis();
            if (!redis) return null;

            const cached = await redis.get(key);
            if (cached) {
                const parsed = JSON.parse(cached);
                // Check if cache is still valid (default 5 minutes)
                const age = Date.now() - parsed.cachedAt;
                if (age < 300000) {
                    return parsed.data;
                }
            }
            return null;
        } catch (error) {
            console.log(`🟡 Cache get error (ignored): ${error.message}`);
            return null;
        }
    },

    clear: async (pattern) => {
        try {
            const redis = await getRedis();
            if (!redis) return 0;

            const keys = await redis.keys(pattern);
            if (keys.length > 0) {
                await redis.del(...keys);
            }
            return keys.length;
        } catch (error) {
            console.log(`🟡 Cache clear error (ignored): ${error.message}`);
            return 0;
        }
    },
    
    // Additional utility methods
    delete: async (key) => {
        try {
            const redis = await getRedis();
            if (!redis) return false;
            await redis.del(key);
            return true;
        } catch (error) {
            console.log(`🟡 Cache delete error (ignored): ${error.message}`);
            return false;
        }
    },
    
    exists: async (key) => {
        try {
            const redis = await getRedis();
            if (!redis) return false;
            return (await redis.exists(key)) === 1;
        } catch (error) {
            console.log(`🟡 Cache exists error (ignored): ${error.message}`);
            return false;
        }
    },
    
    ttl: async (key) => {
        try {
            const redis = await getRedis();
            if (!redis) return -2; // Key doesn't exist
            return await redis.ttl(key);
        } catch (error) {
            console.log(`🟡 Cache TTL error (ignored): ${error.message}`);
            return -2;
        }
    }
};

/**
 * Cache middleware for Express
 */
const cacheMiddleware = (duration = 300) => {
    return async (req, res, next) => {
        // Only cache GET requests
        if (req.method !== 'GET') return next();

        const key = `cache:${req.originalUrl || req.url}`;

        try {
            const cachedResponse = await safeCache.get(key);
            
            if (cachedResponse) {
                console.log(`✅ Cache hit: ${key}`);
                return res.status(200).json({
                    ...cachedResponse,
                    _meta: {
                        cached: true,
                        timestamp: new Date().toISOString()
                    }
                });
            }

            // Intercept Response.json to cache it
            const originalJson = res.json;
            res.json = (body) => {
                // Cache for 'duration' seconds
                safeCache.set(key, body, duration)
                    .then(success => {
                        if (success) console.log(`✅ Cached: ${key} for ${duration}s`);
                    })
                    .catch(err => console.error('Cache Error:', err.message));
                
                return originalJson.call(res, body);
            };

            next();
        } catch (err) {
            // If Redis fails, just proceed without caching
            console.error('Cache Middleware Error:', err.message);
            next();
        }
    };
};

/**
 * Initialize Redis on app startup
 */
const initRedisOnStartup = async () => {
    if (isEnabled) {
        console.log("🔄 Initializing Redis on startup...");
        await initializeRedis();
    }
};

module.exports = {
    // Core functions
    getRedis,
    isRedisAvailable,
    initializeRedis: initRedisOnStartup,
    
    // Cache operations
    safeCache,
    
    // Middleware
    cacheMiddleware,
    
    // Configuration
    REDIS_ENABLED: isEnabled,
    
    // Utility functions
    clearAllAnalyticsCache: async () => {
        return await safeCache.clear('analytics:*');
    },
    
    clearDashboardCache: async (orgId, branchId) => {
        const pattern = `analytics:dashboard:${orgId}:${branchId || '*'}:*`;
        return await safeCache.clear(pattern);
    },
    
    // Health check
    healthCheck: async () => {
        try {
            const redis = await getRedis();
            if (!redis) {
                return {
                    status: 'disabled',
                    message: 'Redis is disabled or not available'
                };
            }
            
            const ping = await redis.ping();
            const info = await redis.info();
            const keys = await redis.dbsize();
            
            return {
                status: 'healthy',
                ping: ping === 'PONG',
                keys,
                version: info.split('\n')[0].split(':')[1].trim(),
                uptime: info.match(/uptime_in_seconds:(\d+)/)?.[1] || 'unknown',
                memory: info.match(/used_memory_human:([\d.]+[KMG]B)/)?.[1] || 'unknown'
            };
        } catch (error) {
            return {
                status: 'error',
                message: error.message
            };
        }
    }
};










// // src/config/redis.js
// const Redis = require("ioredis");

// // Check if Redis should be enabled
// // const REDIS_ENABLED = process.env.REDIS_ENABLED !== "false";
// let redisInstance = null;
// let redisInitialized = false;

// // OR add temporary override:
// const REDIS_ENABLED =
//     process.env.NODE_ENV === "test"
//         ? false
//         : process.env.REDIS_ENABLED !== "false";
// /**
//  * Initialize Redis connection (called only once)
//  */
// const initializeRedis = () => {
//     if (redisInitialized) {
//         return redisInstance;
//     }

//     redisInitialized = true;

//     if (!REDIS_ENABLED) {
//         console.log("🟡 Redis cache disabled via environment variable");
//         return null;
//     }

//     try {
//         const host = process.env.REDIS_HOST || "localhost";
//         const port = process.env.REDIS_PORT || 6379;

//         console.log(`🟡 Attempting Redis connection to ${host}:${port}...`);

//         redisInstance = new Redis({
//             host,
//             port,
//             retryStrategy: (times) => {
//                 if (times > 3) {
//                     console.log(
//                         "🟡 Redis connection failed after 3 attempts, disabling cache",
//                     );
//                     return null; // Stop retrying
//                 }
//                 return Math.min(times * 100, 3000);
//             },
//             maxRetriesPerRequest: 1,
//             enableOfflineQueue: false,
//             lazyConnect: true, // Don't auto-connect
//         });

//         // Try to connect with timeout
//         const connectionPromise = redisInstance.connect();

//         // Add timeout to prevent hanging
//         const timeoutPromise = new Promise((_, reject) => {
//             setTimeout(
//                 () => reject(new Error("Redis connection timeout")),
//                 3000,
//             );
//         });

//         Promise.race([connectionPromise, timeoutPromise])
//             .then(() => {
//                 console.log("✅ Redis connected successfully");
//                 return redisInstance.ping();
//             })
//             .then(() => {
//                 console.log("✅ Redis ping successful");
//             })
//             .catch((error) => {
//                 console.log(`🟡 Redis connection failed: ${error.message}`);
//                 console.log("🟡 Continuing without Redis cache");
//                 redisInstance = null;
//             });

//         // Error handler
//         redisInstance.on("error", (error) => {
//             console.log(`🟡 Redis error: ${error.message}`);
//             redisInstance = null;
//         });
//     } catch (error) {
//         console.log(`🟡 Redis initialization error: ${error.message}`);
//         console.log("🟡 Continuing without Redis cache");
//         redisInstance = null;
//     }

//     return redisInstance;
// };

// /**
//  * Get Redis instance (singleton pattern)
//  */
// const getRedis = () => {
//     if (!redisInitialized) {
//         return initializeRedis();
//     }
//     return redisInstance;
// };

// /**
//  * Check if Redis is available
//  */
// const isRedisAvailable = () => {
//     const redis = getRedis();
//     return redis !== null && redis.status === "ready";
// };

// /**
//  * Safe cache operations (won't throw errors if Redis is unavailable)
//  */
// const safeCache = {
//     set: async (key, data, ttl = 300) => {
//         const redis = getRedis();
//         if (!redis) return false;

//         try {
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
//         const redis = getRedis();
//         if (!redis) return null;

//         try {
//             const cached = await redis.get(key);
//             if (cached) {
//                 const parsed = JSON.parse(cached);
//                 // Check if cache is still valid (5 minutes)
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
//         const redis = getRedis();
//         if (!redis) return 0;

//         try {
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
// };

// module.exports = {
//     getRedis,
//     isRedisAvailable,
//     safeCache,
//     REDIS_ENABLED,
// };
