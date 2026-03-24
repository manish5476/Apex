/**
 * SmartRuleEngine
 *
 * Executes SmartRule configurations against the Product collection.
 * Wraps RuleQueryBuilder with caching, stats tracking, and public DTO transform.
 *
 * Fixed issues vs. v1:
 *   - Ad-hoc cache key uses sorted JSON keys → identical configs always hit same cache entry
 *   - invalidateCache() is now a real method, called by SmartRuleController on update/delete
 *   - Currency pulled from org layout settings (passed in) rather than hardcoded
 *   - Redis import path normalised — always uses safeCache wrapper
 */

'use strict';

const Product    = require('../../../modules/inventory/core/product.model');
// const SmartRule  = require('../models/smartRule.model');
const SmartRule = require('../../models/storefront/smartRule.model');

const RuleQueryBuilder = require('./ruleQueryBuilder.service');
const redisUtils = require('../../../config/redis');
const AppError   = require('../../../core/utils/api/appError');

class SmartRuleEngine {
  constructor() {
    this.CACHE_PREFIX  = 'smart_rule_v2';
    this.DEFAULT_TTL   = 900;   // 15 min — saved rules
    this.ADHOC_TTL     = 300;   // 5 min  — inline configs
  }

  // -------------------------------------------------------------------------
  // Public: execute a saved rule by its DB id
  // -------------------------------------------------------------------------

  /**
   * @param {string} ruleId         SmartRule._id
   * @param {string} organizationId
   * @param {Object} [opts]
   * @param {boolean} [opts.bypassCache]  Force fresh DB query
   * @param {string}  [opts.currency]     Override currency symbol (default 'INR')
   */
  async executeRule(ruleId, organizationId, opts = {}) {
    const cacheKey = `${this.CACHE_PREFIX}:${organizationId}:${ruleId}`;

    if (!opts.bypassCache) {
      const cached = await redisUtils.safeCache.get(cacheKey);
      if (cached) return cached;
    }

    const rule = await SmartRule.findOne({
      _id: ruleId,
      organizationId,
      isActive: true
    }).lean();

    if (!rule) return []; // Rule deleted or deactivated — graceful empty

    const results = await this._runPipeline(rule, organizationId, opts.currency);
    const ttl = (rule.cacheDuration ?? 15) * 60;

    await redisUtils.safeCache.set(cacheKey, results, ttl);
    this._updateStats(ruleId); // fire-and-forget

    return results;
  }

  // -------------------------------------------------------------------------
  // Public: execute an ad-hoc (unsaved) config directly
  // -------------------------------------------------------------------------

  /**
   * @param {Object} config         Inline section config from page builder
   * @param {string} organizationId
   * @param {string} [currency]
   */
  async executeAdHoc(config, organizationId, currency) {
    // ✅ FIX: Sort keys before hashing so key order doesn't create duplicate cache entries
    const stableJson  = JSON.stringify(config, Object.keys(config).sort());
    const configHash  = Buffer.from(stableJson).toString('base64url');
    const cacheKey    = `${this.CACHE_PREFIX}:adhoc:${organizationId}:${configHash}`;

    const cached = await redisUtils.safeCache.get(cacheKey);
    if (cached) return cached;

    const results = await this._runPipeline(config, organizationId, currency);
    await redisUtils.safeCache.set(cacheKey, results, this.ADHOC_TTL);

    return results;
  }

  // -------------------------------------------------------------------------
  // Public: invalidate cache for a specific saved rule
  // Called by SmartRuleController on update and delete
  // -------------------------------------------------------------------------

  async invalidateCache(ruleId, organizationId) {
    const cacheKey = `${this.CACHE_PREFIX}:${organizationId}:${ruleId}`;
    try {
      await redisUtils.safeCache.delete(cacheKey);
    } catch (err) {
      // Non-fatal — stale data will expire via TTL regardless
      console.warn(`[SmartRuleEngine] Cache invalidation failed for rule ${ruleId}:`, err.message);
    }
  }

  // -------------------------------------------------------------------------
  // Private: shared execution pipeline
  // -------------------------------------------------------------------------

  async _runPipeline(ruleConfig, organizationId, currency = 'INR') {
    const { pipeline, sort, limit } = RuleQueryBuilder.build(ruleConfig, organizationId);

    if (limit === 0) return []; // manual_selection with no IDs

    const products = await Product.aggregate([
      ...pipeline,
      { $sort: sort },
      { $limit: limit },

      // Lookup category name
      {
        $lookup: {
          from: 'masters',
          localField: 'categoryId',
          foreignField: '_id',
          as: '_category',
          pipeline: [{ $project: { name: 1, slug: 1 } }]
        }
      },
      // Lookup brand name
      {
        $lookup: {
          from: 'masters',
          localField: 'brandId',
          foreignField: '_id',
          as: '_brand',
          pipeline: [{ $project: { name: 1, slug: 1 } }]
        }
      },

      { $unwind: { path: '$_category', preserveNullAndEmptyArrays: true } },
      { $unwind: { path: '$_brand',    preserveNullAndEmptyArrays: true } },

      // Project only what the storefront card needs
      {
        $project: {
          name:           1,
          slug:           1,
          sku:            1,
          images:         1,
          sellingPrice:   1,
          discountedPrice:1,
          taxRate:        1,
          isTaxInclusive: 1,
          tags:           1,
          'inventory.quantity': 1,
          '_category.name': 1,
          '_category.slug': 1,
          '_brand.name':    1,
          '_brand.slug':    1
        }
      }
    ]);

    return this._transformForPublic(products, currency);
  }

  // -------------------------------------------------------------------------
  // Private: DTO transform — strips internal fields, adds computed fields
  // -------------------------------------------------------------------------

  _transformForPublic(products, currency = 'INR') {
    return products.map(p => {
      const totalStock = p.inventory?.reduce(
        (acc, inv) => acc + (inv.quantity || 0), 0
      ) ?? 0;

      const originalPrice = p.sellingPrice;
      const salePrice     = p.discountedPrice;
      const hasDiscount   = !!(salePrice && salePrice < originalPrice);
      const discountPct   = hasDiscount
        ? Math.round(((originalPrice - salePrice) / originalPrice) * 100)
        : 0;

      const stockStatus =
        totalStock === 0     ? 'out_of_stock' :
        totalStock < 5       ? 'low_stock' :
                               'in_stock';

      return {
        id:   p._id,
        name: p.name,
        slug: p.slug,
        sku:  p.sku  ?? null,

        image:  p.images?.[0] ?? null,
        images: p.images      ?? [],

        price: {
          original:           originalPrice,
          current:            hasDiscount ? salePrice : originalPrice,
          hasDiscount,
          discountPercentage: discountPct,
          currency,
          taxRate:        p.taxRate       ?? 0,
          isTaxInclusive: p.isTaxInclusive ?? false
        },

        category: p._category?.name ?? null,
        categorySlug: p._category?.slug ?? null,
        brand:        p._brand?.name   ?? null,
        brandSlug:    p._brand?.slug   ?? null,
        tags: p.tags ?? [],

        stock: {
          available: totalStock > 0,
          quantity:  totalStock,
          status:    stockStatus
        }
      };
    });
  }

  // -------------------------------------------------------------------------
  // Private: analytics (fire-and-forget)
  // -------------------------------------------------------------------------

  async _updateStats(ruleId) {
    try {
      await SmartRule.findByIdAndUpdate(ruleId, {
        $inc: { executionCount: 1 },
        $set: { lastExecutedAt: new Date() }
      });
    } catch (_) { /* non-critical */ }
  }
}

module.exports = new SmartRuleEngine();

// const Product = require('../../../modules/inventory/core/product.model');
// const SmartRule = require('../../models/storefront/smartRule.model');
// const RuleQueryBuilder = require('./ruleQueryBuilder.service');
// const redis = require('../../../config/redis'); // Using legacy redis path
// const AppError = require('../../../core/utils/api/appError');

// class SmartRuleEngine {
//   constructor() {
//     this.CACHE_PREFIX = 'smart_rule_v1';
//     this.DEFAULT_TTL = 900; // 15 Minutes default cache
//   }

//   /**
//    * Execute a Saved Rule (by ID)
//    * This is used when a Section references a `smartRuleId`
//    */
//   async executeRule(ruleId, organizationId) {
//     const cacheKey = `${this.CACHE_PREFIX}:${organizationId}:${ruleId}`;

//     // 1. Try Cache
//     const cached = await redis.safeCache.get(cacheKey);
//     if (cached) return cached;

//     // 2. Fetch Rule Definition
//     const rule = await SmartRule.findOne({ _id: ruleId, organizationId, isActive: true }).lean();
//     if (!rule) return []; // Graceful fallback if rule deleted

//     // 3. Build & Execute
//     const results = await this._runPipeline(rule, organizationId);

//     // 4. Cache & Return
//     await redis.safeCache.set(cacheKey, results, (rule.cacheDuration || 15) * 60);
    
//     // Async: Update execution stats (Fire & Forget)
//     this._updateStats(ruleId);

//     return results;
//   }

//   /**
//    * Execute an Ad-Hoc Rule (Inline Config)
//    * This is used when a Section has `ruleType`, `limit`, etc. defined directly in JSON
//    * This handles both "New Arrivals" AND "Manual Selection" configurations.
//    */
//   async executeAdHoc(config, organizationId) {
//     // Ad-hoc rules are cached based on a hash of their config object
//     // This means if two sections have the exact same config, they share the cache query.
//     const configHash = Buffer.from(JSON.stringify(config)).toString('base64');
//     const cacheKey = `${this.CACHE_PREFIX}:adhoc:${organizationId}:${configHash}`;

//     // 1. Try Cache (Short TTL for AdHoc - 5 mins)
//     const cached = await redis.safeCache.get(cacheKey);
//     if (cached) return cached;

//     // 2. Execute
//     const results = await this._runPipeline(config, organizationId);
    
//     // 3. Cache
//     await redis.safeCache.set(cacheKey, results, 300); 
    
//     return results;
//   }

//   /**
//    * Internal Execution Logic
//    * Runs the Aggregation and Transforms the Data
//    */
//   async _runPipeline(ruleConfig, organizationId) {
//     const { pipeline, sort, limit } = RuleQueryBuilder.build(ruleConfig, organizationId);

//     // Aggregate with Projection
//     const products = await Product.aggregate([
//       ...pipeline,
//       { $sort: sort },
//       { $limit: limit },
      
//       // OPTIMIZATION: Lookups (Join)
//       // Only join what is strictly necessary for the card display
//       {
//         $lookup: {
//           from: 'masters', // Assuming collection name is plural 'masters'
//           localField: 'categoryId',
//           foreignField: '_id',
//           as: 'category'
//         }
//       },
//       {
//         $lookup: {
//           from: 'masters',
//           localField: 'brandId',
//           foreignField: '_id',
//           as: 'brand'
//         }
//       },
      
//       // Flatten the Lookups (Unwind)
//       { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
//       { $unwind: { path: "$brand", preserveNullAndEmptyArrays: true } },

//       // Project only what UI needs (Optimization)
//       {
//         $project: {
//           name: 1, 
//           slug: 1, 
//           sellingPrice: 1, 
//           discountedPrice: 1, 
//           images: 1, 
//           sku: 1,
//           'category.name': 1, // Only need the name
//           'category.slug': 1,
//           'brand.name': 1,
//           'inventory.quantity': 1,
//           tags: 1
//         }
//       }
//     ]);

//     return this._transformForPublic(products);
//   }

//   /**
//    * Transform DB objects to Safe Public DTOs
//    * Strips internal IDs, cost prices, supplier info, etc.
//    */
//   _transformForPublic(products) {
//     return products.map(p => {
//       // Logic for total stock availability
//       const totalStock = p.inventory?.reduce((acc, curr) => acc + (curr.quantity || 0), 0) || 0;
//       const isAvailable = totalStock > 0;

//       // Discount Calculation
//       const originalPrice = p.sellingPrice;
//       const salePrice = p.discountedPrice;
//       const hasDiscount = salePrice && salePrice < originalPrice;
//       const discountPercentage = hasDiscount 
//         ? Math.round(((originalPrice - salePrice) / originalPrice) * 100) 
//         : 0;

//       return {
//         id: p._id, // Exposed ID for routing
//         name: p.name,
//         slug: p.slug,
//         sku: p.sku,
        
//         // Image Handling (First image is primary)
//         image: p.images?.[0] || null, 
//         images: p.images || [],

//         // Price Object
//         price: {
//           original: originalPrice,
//           current: hasDiscount ? salePrice : originalPrice,
//           hasDiscount: hasDiscount,
//           discountPercentage: hasDiscount ? discountPercentage : 0,
//           currency: 'INR' // Or dynamic if multi-currency supported
//         },

//         // Meta
//         category: p.category?.name || 'Uncategorized',
//         brand: p.brand?.name || null,
//         tags: p.tags || [],
        
//         // Stock Status (Boolean only, hide exact count for public)
//         isAvailable: isAvailable,
//         stockLabel: isAvailable ? 'In Stock' : 'Out of Stock'
//       };
//     });
//   }

//   async _updateStats(ruleId) {
//     try {
//       await SmartRule.findByIdAndUpdate(ruleId, { 
//         $inc: { executionCount: 1 }, 
//         $set: { lastExecutedAt: new Date() } 
//       });
//     } catch (e) { /* ignore analytics errors */ }
//   }
// }

// module.exports = new SmartRuleEngine();