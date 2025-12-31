// src/config/redis.js
const Redis = require("ioredis");

// Check if Redis should be enabled
// const REDIS_ENABLED = process.env.REDIS_ENABLED !== "false";
let redisInstance = null;
let redisInitialized = false;

// OR add temporary override:
const REDIS_ENABLED =
    process.env.NODE_ENV === "test"
        ? false
        : process.env.REDIS_ENABLED !== "false";
/**
 * Initialize Redis connection (called only once)
 */
const initializeRedis = () => {
    if (redisInitialized) {
        return redisInstance;
    }

    redisInitialized = true;

    if (!REDIS_ENABLED) {
        console.log("🟡 Redis cache disabled via environment variable");
        return null;
    }

    try {
        const host = process.env.REDIS_HOST || "localhost";
        const port = process.env.REDIS_PORT || 6379;

        console.log(`🟡 Attempting Redis connection to ${host}:${port}...`);

        redisInstance = new Redis({
            host,
            port,
            retryStrategy: (times) => {
                if (times > 3) {
                    console.log(
                        "🟡 Redis connection failed after 3 attempts, disabling cache",
                    );
                    return null; // Stop retrying
                }
                return Math.min(times * 100, 3000);
            },
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
            lazyConnect: true, // Don't auto-connect
        });

        // Try to connect with timeout
        const connectionPromise = redisInstance.connect();

        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(
                () => reject(new Error("Redis connection timeout")),
                3000,
            );
        });

        Promise.race([connectionPromise, timeoutPromise])
            .then(() => {
                console.log("✅ Redis connected successfully");
                return redisInstance.ping();
            })
            .then(() => {
                console.log("✅ Redis ping successful");
            })
            .catch((error) => {
                console.log(`🟡 Redis connection failed: ${error.message}`);
                console.log("🟡 Continuing without Redis cache");
                redisInstance = null;
            });

        // Error handler
        redisInstance.on("error", (error) => {
            console.log(`🟡 Redis error: ${error.message}`);
            redisInstance = null;
        });
    } catch (error) {
        console.log(`🟡 Redis initialization error: ${error.message}`);
        console.log("🟡 Continuing without Redis cache");
        redisInstance = null;
    }

    return redisInstance;
};

/**
 * Get Redis instance (singleton pattern)
 */
const getRedis = () => {
    if (!redisInitialized) {
        return initializeRedis();
    }
    return redisInstance;
};

/**
 * Check if Redis is available
 */
const isRedisAvailable = () => {
    const redis = getRedis();
    return redis !== null && redis.status === "ready";
};

/**
 * Safe cache operations (won't throw errors if Redis is unavailable)
 */
const safeCache = {
    set: async (key, data, ttl = 300) => {
        const redis = getRedis();
        if (!redis) return false;

        try {
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
        const redis = getRedis();
        if (!redis) return null;

        try {
            const cached = await redis.get(key);
            if (cached) {
                const parsed = JSON.parse(cached);
                // Check if cache is still valid (5 minutes)
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
        const redis = getRedis();
        if (!redis) return 0;

        try {
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
};

module.exports = {
    getRedis,
    isRedisAvailable,
    safeCache,
    REDIS_ENABLED,
};
