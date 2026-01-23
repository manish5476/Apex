const { safeCache } = require('../../../core/utils/_legacy/redis');
const memoryCache = new Map();

/* ==========================================================================
   1. CACHE MANAGEMENT - FIXED VERSION
   ========================================================================== */

// Function definitions first
async function cacheData(key, data, ttl = 300) {  
    return safeCache.set(key, data, ttl);
}

async function getCachedData(key) {
    return safeCache.get(key);
}

async function clearCache(pattern) {
    return safeCache.clear(pattern);
}

/* ==========================================================================
   2. ENHANCED CACHE WITH FALLBACK
   ========================================================================== */

async function cacheDataInMemory(key, data, ttl = 300) {
    try {
        const cacheItem = {
            data,
            cachedAt: Date.now(),
            expiresAt: Date.now() + (ttl * 1000)
        };
        memoryCache.set(key, cacheItem);
        return true;
    } catch (error) {
        console.warn('Memory cache error:', error.message);
        return false;
    }
}

async function getCachedDataFromMemory(key) {
    try {
        const cached = memoryCache.get(key);
        if (cached && Date.now() < cached.expiresAt) {
            return cached.data;
        } else if (cached) {
            memoryCache.delete(key); // Clean expired
        }
        return null;
    } catch (error) {
        console.warn('Memory cache error:', error.message);
        return null;
    }
}

/* ==========================================================================
   3. SMART CACHE FUNCTIONS
   ========================================================================== */

const smartCache = {
    /**
     * Smart cache that tries Redis first, then memory
     */
    set: async (key, data, ttl = 300) => {
        // Try Redis first
        try {
            const redisResult = await safeCache.set(key, data, ttl);
            if (redisResult) {
                console.debug(`✅ Redis cache set: ${key}`);
                return true;
            }
        } catch (redisError) {
            console.warn(`Redis cache failed: ${redisError.message}`);
        }
        
        // Fallback to memory
        console.debug(`🟡 Falling back to memory cache: ${key}`);
        return await cacheDataInMemory(key, data, ttl);
    },

    get: async (key) => {
        // Try Redis first
        try {
            const redisData = await safeCache.get(key);
            if (redisData) {
                console.debug(`✅ Redis cache hit: ${key}`);
                return redisData;
            }
        } catch (redisError) {
            console.warn(`Redis cache failed: ${redisError.message}`);
        }
        
        // Fallback to memory
        console.debug(`🟡 Checking memory cache: ${key}`);
        return await getCachedDataFromMemory(key);
    },

    clear: async (pattern) => {
        let totalCleared = 0;
        
        // Clear Redis cache
        try {
            const redisCleared = await safeCache.clear(pattern);
            totalCleared += redisCleared;
            console.debug(`✅ Cleared ${redisCleared} Redis keys matching: ${pattern}`);
        } catch (redisError) {
            console.warn(`Failed to clear Redis cache: ${redisError.message}`);
        }
        
        // Clear memory cache
        let memoryCleared = 0;
        for (const key of memoryCache.keys()) {
            if (key.includes(pattern)) {
                memoryCache.delete(key);
                memoryCleared++;
            }
        }
        totalCleared += memoryCleared;
        
        if (memoryCleared > 0) {
            console.debug(`✅ Cleared ${memoryCleared} memory keys matching: ${pattern}`);
        }
        
        return totalCleared;
    }
};

/**
 * Generate cache key for analytics queries
 */
function generateAnalyticsCacheKey(endpoint, orgId, branchId, startDate, endDate, extraParams = {}) {
    const paramsString = JSON.stringify({
        orgId,
        branchId: branchId || 'all',
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0],
        ...extraParams
    });
    
    // Simple hash for shorter keys
    const hash = require('crypto')
        .createHash('md5')
        .update(paramsString)
        .digest('hex')
        .substring(0, 8);
    
    return `analytics:${endpoint}:${hash}`;
}

/**
 * Get data with caching
 */
async function getWithCache(cacheKey, fetchFunction, ttl = 300) {
    // Try cache first
    const cached = await getCachedData(cacheKey);
    if (cached) {
        return {
            data: cached,
            cached: true,
            source: 'redis'
        };
    }
    
    // Fetch fresh data
    const freshData = await fetchFunction();
    
    // Cache it (fire and forget)
    cacheData(cacheKey, freshData, ttl).catch(err => 
        console.warn('Failed to cache data:', err.message)
    );
    
    return {
        data: freshData,
        cached: false,
        source: 'database'
    };
}

/* ==========================================================================
   EXPORTS
   ========================================================================== */

module.exports = {
    cacheData,
    getCachedData,
    clearCache,
    cacheDataInMemory,
    getCachedDataFromMemory,
    smartCache,
    generateAnalyticsCacheKey,
    getWithCache
};

// const { safeCache } = require('../../../core/utils/_legacy/redis');
// const memoryCache = new Map();

// module.exports = {
//     cacheData,
//     getCachedData,
//     clearCache,
//     cacheDataInMemory,
//     getCachedDataFromMemory,
//     smartCache,
//     generateAnalyticsCacheKey,
//     getWithCache
// };

// /* ==========================================================================
//    1. CACHE MANAGEMENT - FIXED VERSION
//    ========================================================================== */
// exports.cacheData = async (key, data, ttl = 300) => {  return safeCache.set(key, data, ttl);};

// exports.getCachedData = async (key) => {
//     return safeCache.get(key);
// };

// exports.clearCache = async (pattern) => {
//     return safeCache.clear(pattern);
// };

// /* ==========================================================================
//    2. ENHANCED CACHE WITH FALLBACK
//    ========================================================================== */

// // Simple in-memory fallback cache

// exports.cacheDataInMemory = async (key, data, ttl = 300) => {
//     try {
//         const cacheItem = {
//             data,
//             cachedAt: Date.now(),
//             expiresAt: Date.now() + (ttl * 1000)
//         };
//         memoryCache.set(key, cacheItem);
//         return true;
//     } catch (error) {
//         console.warn('Memory cache error:', error.message);
//         return false;
//     }
// };

// exports.getCachedDataFromMemory = async (key) => {
//     try {
//         const cached = memoryCache.get(key);
//         if (cached && Date.now() < cached.expiresAt) {
//             return cached.data;
//         } else if (cached) {
//             memoryCache.delete(key); // Clean expired
//         }
//         return null;
//     } catch (error) {
//         console.warn('Memory cache error:', error.message);
//         return null;
//     }
// };




// /* ==========================================================================
//    3. SMART CACHE FUNCTIONS
//    ========================================================================== */

// exports.smartCache = {
//     /**
//      * Smart cache that tries Redis first, then memory
//      */
//     set: async (key, data, ttl = 300) => {
//         // Try Redis first
//         try {
//             const redisResult = await safeCache.set(key, data, ttl);
//             if (redisResult) {
//                 console.debug(`✅ Redis cache set: ${key}`);
//                 return true;
//             }
//         } catch (redisError) {
//             console.warn(`Redis cache failed: ${redisError.message}`);
//         }
        
//         // Fallback to memory
//         console.debug(`🟡 Falling back to memory cache: ${key}`);
//         return await this.cacheDataInMemory(key, data, ttl);
//     },

//     get: async (key) => {
//         // Try Redis first
//         try {
//             const redisData = await safeCache.get(key);
//             if (redisData) {
//                 console.debug(`✅ Redis cache hit: ${key}`);
//                 return redisData;
//             }
//         } catch (redisError) {
//             console.warn(`Redis cache failed: ${redisError.message}`);
//         }
        
//         // Fallback to memory
//         console.debug(`🟡 Checking memory cache: ${key}`);
//         return await this.getCachedDataFromMemory(key);
//     },

//     clear: async (pattern) => {
//         let totalCleared = 0;
        
//         // Clear Redis cache
//         try {
//             const redisCleared = await safeCache.clear(pattern);
//             totalCleared += redisCleared;
//             console.debug(`✅ Cleared ${redisCleared} Redis keys matching: ${pattern}`);
//         } catch (redisError) {
//             console.warn(`Failed to clear Redis cache: ${redisError.message}`);
//         }
        
//         // Clear memory cache
//         let memoryCleared = 0;
//         for (const key of memoryCache.keys()) {
//             if (key.includes(pattern)) {
//                 memoryCache.delete(key);
//                 memoryCleared++;
//             }
//         }
//         totalCleared += memoryCleared;
        
//         if (memoryCleared > 0) {
//             console.debug(`✅ Cleared ${memoryCleared} memory keys matching: ${pattern}`);
//         }
        
//         return totalCleared;
//     }
// };

// /**
//  * Generate cache key for analytics queries
//  */
// exports.generateAnalyticsCacheKey = (endpoint, orgId, branchId, startDate, endDate, extraParams = {}) => {
//     const paramsString = JSON.stringify({
//         orgId,
//         branchId: branchId || 'all',
//         start: startDate.toISOString().split('T')[0],
//         end: endDate.toISOString().split('T')[0],
//         ...extraParams
//     });
    
//     // Simple hash for shorter keys
//     const hash = require('crypto')
//         .createHash('md5')
//         .update(paramsString)
//         .digest('hex')
//         .substring(0, 8);
    
//     return `analytics:${endpoint}:${hash}`;
// };

// /**
//  * Get data with caching
//  */
// exports.getWithCache = async (cacheKey, fetchFunction, ttl = 300) => {
//     // Try cache first
//     const cached = await this.getCachedData(cacheKey);
//     if (cached) {
//         return {
//             data: cached,
//             cached: true,
//             source: 'redis'
//         };
//     }
    
//     // Fetch fresh data
//     const freshData = await fetchFunction();
    
//     // Cache it (fire and forget)
//     this.cacheData(cacheKey, freshData, ttl).catch(err => 
//         console.warn('Failed to cache data:', err.message)
//     );
    
//     return {
//         data: freshData,
//         cached: false,
//         source: 'database'
//     };
// };