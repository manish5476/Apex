const Product = require('../../../modules/inventory/core/product.model');
const { SmartRule } = require('../../models/storefront');
const RuleQueryBuilder = require('./ruleQueryBuilder.service');
const AppError = require('../../../core/utils/appError');
const redis = require('../../../core/utils/_legacy/redis');

class SmartRuleEngine {
  constructor() {
    this.cachePrefix = 'smartrule:v1';
    this.cacheEnabled = true;
    this.MAX_LIMIT = 50;
  }

  /**
   * Main Execution Method: Fetches Rule from DB -> Builds Query -> Returns Products
   */
  async executeRule(ruleId, organizationId, options = {}) {
    const start = Date.now();

    // 1. Fetch Rule Definition
    const rule = await SmartRule.findOne({
      _id: ruleId,
      organizationId,
      isActive: true
    }).lean();

    if (!rule) {
      throw new AppError('Smart rule not found or inactive', 404);
    }

    // 2. Check Cache
    const cacheKey = this.buildCacheKey(ruleId, organizationId);
    if (this.cacheEnabled) {
      // Use safeCache get from your redis util if available, otherwise direct redis.get
      // Assuming redis.get returns a string or null
      const cached = await redis.get(cacheKey); 
      if (cached) {
        this.logExecution(ruleId, 'cache-hit', Date.now() - start);
        return JSON.parse(cached);
      }
    }

    // 3. Build Aggregation Pipeline
    const query = RuleQueryBuilder.build(rule, organizationId);

    // Prefer runtime option limit (e.g. from UI slider) over rule's default limit
    const finalLimit = options.limit 
        ? Math.min(parseInt(options.limit), this.MAX_LIMIT)
        : Math.min(query.limit, this.MAX_LIMIT);

    // 4. Execute DB Query
    const products = await Product.aggregate([
      ...query.pipeline,
      { $sort: query.sort },
      { $limit: finalLimit } 
    ]);

    // 5. Transform & Cache
    const result = this.transform(products);

    // Update Stats (Async)
    this.updateRuleStats(ruleId);

    if (this.cacheEnabled) {
      await redis.setex(
        cacheKey,
        (rule.cacheDuration || 15) * 60, // Convert minutes to seconds
        JSON.stringify(result)
      );
    }

    this.logExecution(ruleId, 'db-hit', Date.now() - start);

    return result;
  }

  /**
   * executeAdHocRule: For "Smart" sections configured directly in the UI 
   * (e.g. "Show Best Sellers" without creating a saved Rule entity first)
   */
  async executeAdHocRule(config, organizationId) {
    const start = Date.now();

    // 1. Construct a temporary rule object 
    const adHocRule = {
      ruleType: config.ruleType,
      limit: parseInt(config.limit || config.itemsPerView || 12),
      sortBy: 'createdAt',
      sortOrder: 'desc',
      filters: [] 
    };

    // 2. Build Query
    const query = RuleQueryBuilder.build(adHocRule, organizationId);

    // 3. Execute
    const products = await Product.aggregate([
      ...query.pipeline,
      { $sort: query.sort },
      { $limit: adHocRule.limit }
    ]);

    const result = this.transform(products);

    this.logExecution('ADHOC-' + config.ruleType, 'db-hit', Date.now() - start);

    return result;
  }

  /**
   * Preview a rule logic before saving it (Admin Panel feature)
   */
  async previewRule(ruleData, organizationId, limit = 5) {
    const tempRule = {
      ...ruleData,
      limit: Math.min(limit, this.MAX_LIMIT)
    };

    const query = RuleQueryBuilder.build(tempRule, organizationId);

    const products = await Product.aggregate([
      ...query.pipeline,
      { $sort: query.sort },
      { $limit: tempRule.limit }
    ]);

    return {
      preview: this.transform(products),
      estimatedResults: products.length // Note: Pagination logic usually requires a separate count query
    };
  }

  // --- Cache Management ---

  async clearRuleCache(ruleId, organizationId) {
    const key = this.buildCacheKey(ruleId, organizationId);
    await redis.del(key);
  }

  async clearOrganizationCache(organizationId) {
    const keys = await redis.keys(`${this.cachePrefix}:${organizationId}:*`);
    if (keys.length) {
      await redis.del(keys);
    }
  }

  buildCacheKey(ruleId, organizationId) {
    return `${this.cachePrefix}:${organizationId}:${ruleId}`;
  }

  async updateRuleStats(ruleId) {
    try {
      await SmartRule.findByIdAndUpdate(ruleId, {
        $inc: { executionCount: 1 },
        $set: { lastExecutedAt: new Date() }
      });
    } catch (err) {
      console.error('Failed to update rule stats', err);
    }
  }

  // --- Transformation ---

  transform(products) {
    return products.map(p => ({
      id: p._id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      // Images: Ensure fallback if empty
      images: (p.images && p.images.length) ? p.images : [],
      image: (p.images && p.images.length) ? p.images[0] : null,
      
      price: {
        original: p.sellingPrice,
        discounted: p.discountedPrice,
        currency: 'USD', // Should ideally come from Org settings
        hasDiscount: !!(p.discountedPrice && p.discountedPrice < p.sellingPrice)
      },
      
      // Handle populated fields if they exist, or raw IDs if not
      category: p.category?.name || p.categoryId,
      brand: p.brand?.name || p.brandId,
      
      tags: p.tags || [],
      sku: p.sku,
      
      stock: {
        available: p.inventory?.some(i => i.quantity > 0) || false
      }
    }));
  }

  logExecution(ruleId, source, durationMs) {
    // Only log if slow or in dev mode
    if (process.env.NODE_ENV === 'development' || durationMs > 200) {
      console.log('[SmartRule]', {
        ruleId,
        source,
        durationMs,
        at: new Date().toISOString()
      });
    }
  }
}

module.exports = new SmartRuleEngine();

// // FIX: Removed curly braces
// const Product = require('../../../modules/inventory/core/product.model');
// const { SmartRule } = require('../../models/storefront');
// const RuleQueryBuilder = require('./ruleQueryBuilder.service');
// const AppError = require('../../../core/utils/appError');
// const redis = require('../../../core/utils/_legacy/redis');

// class SmartRuleEngine {
//   constructor() {
//     this.cachePrefix = 'smartrule:v1';
//     this.cacheEnabled = true;
//     this.MAX_LIMIT = 50;
//   }

//   async executeRule(ruleId, organizationId, options = {}) {
//     const start = Date.now();

//     const rule = await SmartRule.findOne({
//       _id: ruleId,
//       organizationId,
//       isActive: true
//     }).lean();

//     if (!rule) {
//       throw new AppError('Smart rule not found or inactive', 404);
//     }

//     const cacheKey = this.buildCacheKey(ruleId, organizationId);

//     if (this.cacheEnabled) {
//       const cached = await redis.get(cacheKey);
//       if (cached) {
//         this.logExecution(ruleId, 'cache-hit', Date.now() - start);
//         return JSON.parse(cached);
//       }
//     }

//     const query = RuleQueryBuilder.build(rule, organizationId);

//     // Prefer option limit over rule limit
//     const finalLimit = options.limit 
//         ? Math.min(parseInt(options.limit), this.MAX_LIMIT)
//         : Math.min(query.limit, this.MAX_LIMIT);

//     const products = await Product.aggregate([
//       ...query.pipeline,
//       { $sort: query.sort },
//       { $limit: finalLimit } 
//     ]);

//     const result = this.transform(products);

//     await this.updateRuleStats(ruleId);

//     if (this.cacheEnabled) {
//       await redis.setex(
//         cacheKey,
//         (rule.cacheDuration || 15) * 60,
//         JSON.stringify(result)
//       );
//     }

//     this.logExecution(ruleId, 'db-hit', Date.now() - start);

//     return result;
//   }

//   async previewRule(ruleData, organizationId, limit = 5) {
//     const tempRule = {
//       ...ruleData,
//       limit: Math.min(limit, this.MAX_LIMIT)
//     };

//     const query = RuleQueryBuilder.build(tempRule, organizationId);

//     const products = await Product.aggregate([
//       ...query.pipeline,
//       { $sort: query.sort },
//       { $limit: tempRule.limit }
//     ]);

//     return {
//       preview: this.transform(products),
//       estimatedResults: products.length
//     };
//   }

//   async clearRuleCache(ruleId, organizationId) {
//     const key = this.buildCacheKey(ruleId, organizationId);
//     await redis.del(key);
//   }

//   async clearOrganizationCache(organizationId) {
//     const keys = await redis.keys(`${this.cachePrefix}:*:${organizationId}`);
//     if (keys.length) {
//       await redis.del(keys);
//     }
//   }

//   buildCacheKey(ruleId, organizationId) {
//     return `${this.cachePrefix}:${organizationId}:${ruleId}`;
//   }

//   async updateRuleStats(ruleId) {
//     await SmartRule.findByIdAndUpdate(ruleId, {
//       $inc: { executionCount: 1 },
//       $set: { lastExecutedAt: new Date() }
//     });
//   }

//   transform(products) {
//     return products.map(p => ({
//       id: p._id,
//       name: p.name,
//       slug: p.slug,
//       description: p.description,
//       images: p.images || [],
//       price: {
//         original: p.sellingPrice,
//         discounted: p.discountedPrice,
//         currency: 'USD',
//         hasDiscount:
//           p.discountedPrice &&
//           p.discountedPrice < p.sellingPrice
//       },
//       category: p.category,
//       tags: p.tags || [],
//       sku: p.sku,
//       stock: {
//         available: p.inventory?.some(i => i.quantity > 0) || false
//       }
//     }));
//   }

//   logExecution(ruleId, source, durationMs) {
//     console.log('[SmartRule]', {
//       ruleId,
//       source,
//       durationMs,
//       at: new Date().toISOString()
//     });
//   }
//   /**
//    * Execute a rule defined directly in JSON config (No DB lookup)
//    */
//   async executeAdHocRule(config, organizationId) {
//     const start = Date.now();

//     // 1. Construct a temporary rule object that matches the Schema structure
//     const adHocRule = {
//       ruleType: config.ruleType,
//       limit: parseInt(config.limit || config.itemsPerView || 10),
//       sortBy: 'createdAt', // Default sort
//       sortOrder: 'desc',
//       filters: [] 
//     };

//     // 2. Build the query using your existing Service
//     const query = RuleQueryBuilder.build(adHocRule, organizationId);

//     // 3. Execute
//     const products = await Product.aggregate([
//       ...query.pipeline,
//       { $sort: query.sort },
//       { $limit: adHocRule.limit }
//     ]);

//     const result = this.transform(products);

//     this.logExecution('ADHOC-' + config.ruleType, 'db-hit', Date.now() - start);

//     return result;
//   }
// }

// module.exports = new SmartRuleEngine();
