// src/utils/openingBalanceCache.js
const { safeCache } = require("../../../core/utils/_legacy/redis");

// Cache TTL configuration
const CACHE_TTL = 120; // seconds (2 minutes)
const OPENING_BALANCE_PREFIX = 'opening';

/**
 * Build cache key for opening balance
 */
function buildOpeningKey(orgId, partyId, startDate) {
  return `${OPENING_BALANCE_PREFIX}:${orgId}:${partyId || 'all'}:${startDate || 'none'}`;
}

/**
 * Get opening balance from cache
 */
async function getOpeningBalance(orgId, partyId, startDate) {
  try {
    const key = buildOpeningKey(orgId, partyId, startDate);
    const value = await safeCache.get(key);
    
    return value ? Number(value) : null;
  } catch (error) {
    console.log(`🟡 Opening balance cache get error: ${error.message}`);
    return null;
  }
}

/**
 * Set opening balance in cache
 */
async function setOpeningBalance(orgId, partyId, startDate, balance) {
  try {
    const key = buildOpeningKey(orgId, partyId, startDate);
    const success = await safeCache.set(key, balance, CACHE_TTL);
    
    if (success) {
      console.log(`✅ Cached opening balance: ${key} = ${balance}`);
    }
    return success;
  } catch (error) {
    console.log(`🟡 Opening balance cache set error: ${error.message}`);
    return false;
  }
}

/**
 * Get opening balance with fallback calculation
 */
async function getOpeningBalanceWithFallback(orgId, partyId, startDate, calculateFunction) {
  try {
    // Try cache first
    const cachedBalance = await getOpeningBalance(orgId, partyId, startDate);
    if (cachedBalance !== null) {
      return {
        balance: cachedBalance,
        cached: true,
        source: 'redis'
      };
    }
    
    // Calculate if not in cache
    if (typeof calculateFunction === 'function') {
      const calculatedBalance = await calculateFunction();
      
      // Cache the result (fire and forget)
      setOpeningBalance(orgId, partyId, startDate, calculatedBalance)
        .catch(err => console.log('Failed to cache opening balance:', err.message));
      
      return {
        balance: calculatedBalance,
        cached: false,
        source: 'calculated'
      };
    }
    
    return {
      balance: 0,
      cached: false,
      source: 'default'
    };
    
  } catch (error) {
    console.log(`🟡 Opening balance fetch error: ${error.message}`);
    return {
      balance: 0,
      cached: false,
      source: 'error',
      error: error.message
    };
  }
}

/**
 * Invalidate opening balance cache for specific organization
 */
async function invalidateOpeningBalance(orgId, partyId = null, startDate = null) {
  try {
    if (partyId && startDate) {
      // Invalidate specific key
      const key = buildOpeningKey(orgId, partyId, startDate);
      const success = await safeCache.delete(key);
      
      if (success) {
        console.log(`✅ Invalidated specific opening balance: ${key}`);
      }
      return success;
    } else if (partyId) {
      // Invalidate all for specific party
      const pattern = `${OPENING_BALANCE_PREFIX}:${orgId}:${partyId}:*`;
      const cleared = await safeCache.clear(pattern);
      
      console.log(`✅ Invalidated ${cleared} opening balances for party ${partyId}`);
      return cleared;
    } else {
      // Invalidate all for organization
      const pattern = `${OPENING_BALANCE_PREFIX}:${orgId}:*`;
      const cleared = await safeCache.clear(pattern);
      
      console.log(`✅ Invalidated ${cleared} opening balances for organization ${orgId}`);
      return cleared;
    }
  } catch (error) {
    console.log(`🟡 Opening balance invalidation error: ${error.message}`);
    return 0;
  }
}

/**
 * Bulk set opening balances
 */
async function setBulkOpeningBalances(balances) {
  if (!Array.isArray(balances) || balances.length === 0) {
    return 0;
  }
  
  let successCount = 0;
  const errors = [];
  
  for (const balance of balances) {
    try {
      const { orgId, partyId, startDate, balance: amount } = balance;
      
      if (!orgId || amount === undefined) {
        errors.push(`Invalid balance entry: ${JSON.stringify(balance)}`);
        continue;
      }
      
      const success = await setOpeningBalance(orgId, partyId, startDate, amount);
      if (success) successCount++;
      
    } catch (error) {
      errors.push(`Error caching balance: ${error.message}`);
    }
  }
  
  if (errors.length > 0) {
    console.log(`🟡 Bulk cache errors: ${errors.join('; ')}`);
  }
  
  console.log(`✅ Bulk cached ${successCount} of ${balances.length} opening balances`);
  return successCount;
}

/**
 * Get opening balance statistics
 */
async function getOpeningBalanceStats(orgId) {
  try {
    const pattern = `${OPENING_BALANCE_PREFIX}:${orgId}:*`;
    // Note: safeCache doesn't have keys method, but we can track stats differently
    
    // For now, return basic stats
    return {
      organizationId: orgId,
      cacheEnabled: true,
      ttl: CACHE_TTL,
      prefix: OPENING_BALANCE_PREFIX,
      estimatedEntries: 0, // Can't get this without keys command
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.log(`🟡 Opening balance stats error: ${error.message}`);
    return {
      organizationId: orgId,
      cacheEnabled: false,
      error: error.message
    };
  }
}

/**
 * Pre-warm cache for common opening balances
 */
async function prewarmOpeningBalanceCache(orgId, commonParties) {
  try {
    console.log(`🔍 Pre-warming opening balance cache for org ${orgId}`);
    
    const results = [];
    for (const party of commonParties) {
      try {
        // This is just a placeholder - you'd implement actual pre-warming logic
        // For example, cache balance of 0 for each party
        await setOpeningBalance(orgId, party.id, 'none', 0);
        results.push({
          partyId: party.id,
          success: true
        });
      } catch (error) {
        results.push({
          partyId: party.id,
          success: false,
          error: error.message
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    console.log(`✅ Pre-warmed ${successCount} of ${commonParties.length} opening balances`);
    
    return {
      total: commonParties.length,
      success: successCount,
      failed: commonParties.length - successCount,
      results
    };
    
  } catch (error) {
    console.log(`🟡 Pre-warm error: ${error.message}`);
    return {
      total: commonParties.length,
      success: 0,
      failed: commonParties.length,
      error: error.message
    };
  }
}

/**
 * Clear all opening balance caches (for all organizations)
 * Use with caution!
 */
async function clearAllOpeningBalances() {
  try {
    const pattern = `${OPENING_BALANCE_PREFIX}:*`;
    const cleared = await safeCache.clear(pattern);
    
    console.log(`🗑️ Cleared ALL opening balance caches (${cleared} keys)`);
    return cleared;
  } catch (error) {
    console.log(`🟡 Clear all opening balances error: ${error.message}`);
    return 0;
  }
}

/**
 * Check if opening balance cache is healthy
 */
async function checkCacheHealth() {
  try {
    const testKey = `${OPENING_BALANCE_PREFIX}:health:test`;
    const testValue = Date.now();
    
    // Test set
    const setSuccess = await safeCache.set(testKey, testValue, 10);
    if (!setSuccess) {
      return {
        healthy: false,
        message: 'Cache set failed'
      };
    }
    
    // Test get
    const retrievedValue = await safeCache.get(testKey);
    const getSuccess = retrievedValue === testValue;
    
    // Clean up
    await safeCache.delete(testKey);
    
    return {
      healthy: getSuccess,
      message: getSuccess ? 'Cache is healthy' : 'Cache get returned wrong value',
      testValue,
      retrievedValue
    };
  } catch (error) {
    return {
      healthy: false,
      message: `Cache health check failed: ${error.message}`
    };
  }
}

module.exports = {
  // Core functions
  getOpeningBalance,
  setOpeningBalance,
  invalidateOpeningBalance,
  
  // Enhanced functions
  getOpeningBalanceWithFallback,
  setBulkOpeningBalances,
  getOpeningBalanceStats,
  prewarmOpeningBalanceCache,
  clearAllOpeningBalances,
  checkCacheHealth,
  
  // Utility functions
  buildOpeningKey,
  
  // Constants
  CACHE_TTL,
  OPENING_BALANCE_PREFIX
};
