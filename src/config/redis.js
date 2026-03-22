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
            host: process.env.REDIS_HOST || "127.0.0.1",
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

        redisInstance.on("error", (err) => {
            console.log(`🟡 Redis Error: ${err.message}`);
            // If connection refused, we don't want to spam logs
            if (err.message.includes('ECONNREFUSED')) {
                isEnabled = false;
            }
        });
        
        redisInstance.on("connect", () => {
            console.log("✅ Redis connected");
            isEnabled = true;
        });

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

    delete: async (key) => {
        try {
            const redis = await getRedis();
            if (!redis) return false;
            await redis.del(key);
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

/**
 * Health check for Redis
 */
const healthCheck = async () => {
    try {
        const redis = await getRedis();
        if (!redis) {
            return {
                status: 'unhealthy',
                enabled: isEnabled,
                message: 'Redis is disabled or connection failed'
            };
        }
        const ping = await redis.ping();
        return {
            status: ping === 'PONG' ? 'healthy' : 'unhealthy',
            enabled: isEnabled,
            message: ping === 'PONG' ? 'Connected to Redis' : 'Redis responded with ' + ping
        };
    } catch (error) {
        return {
            status: 'error',
            enabled: isEnabled,
            message: error.message
        };
    }
};

/**
 * Express Middleware to cache GET requests
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

            const originalJson = res.json.bind(res);
            res.json = (body) => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    safeCache.set(key, body, duration).catch(() => {});
                }
                return originalJson(body);
            };

            next();
        } catch (err) {
            next();
        }
    };
};

module.exports = {
    initializeRedis,
    getRedis,
    safeCache,
    cacheMiddleware,
    healthCheck,
    isEnabled: () => isEnabled
};
