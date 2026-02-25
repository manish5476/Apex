const Product = require('../../../modules/inventory/core/product.model');
const SmartRule = require('../../models/storefront/smartRule.model');
const RuleQueryBuilder = require('./ruleQueryBuilder.service');
const redis = require('../../../config/redis'); // Using legacy redis path
const AppError = require('../../../core/utils/api/appError');

class SmartRuleEngine {
  constructor() {
    this.CACHE_PREFIX = 'smart_rule_v1';
    this.DEFAULT_TTL = 900; // 15 Minutes default cache
  }

  /**
   * Execute a Saved Rule (by ID)
   * This is used when a Section references a `smartRuleId`
   */
  async executeRule(ruleId, organizationId) {
    const cacheKey = `${this.CACHE_PREFIX}:${organizationId}:${ruleId}`;

    // 1. Try Cache
    const cached = await redis.safeCache.get(cacheKey);
    if (cached) return cached;

    // 2. Fetch Rule Definition
    const rule = await SmartRule.findOne({ _id: ruleId, organizationId, isActive: true }).lean();
    if (!rule) return []; // Graceful fallback if rule deleted

    // 3. Build & Execute
    const results = await this._runPipeline(rule, organizationId);

    // 4. Cache & Return
    await redis.safeCache.set(cacheKey, results, (rule.cacheDuration || 15) * 60);
    
    // Async: Update execution stats (Fire & Forget)
    this._updateStats(ruleId);

    return results;
  }

  /**
   * Execute an Ad-Hoc Rule (Inline Config)
   * This is used when a Section has `ruleType`, `limit`, etc. defined directly in JSON
   * This handles both "New Arrivals" AND "Manual Selection" configurations.
   */
  async executeAdHoc(config, organizationId) {
    // Ad-hoc rules are cached based on a hash of their config object
    // This means if two sections have the exact same config, they share the cache query.
    const configHash = Buffer.from(JSON.stringify(config)).toString('base64');
    const cacheKey = `${this.CACHE_PREFIX}:adhoc:${organizationId}:${configHash}`;

    // 1. Try Cache (Short TTL for AdHoc - 5 mins)
    const cached = await redis.safeCache.get(cacheKey);
    if (cached) return cached;

    // 2. Execute
    const results = await this._runPipeline(config, organizationId);
    
    // 3. Cache
    await redis.safeCache.set(cacheKey, results, 300); 
    
    return results;
  }

  /**
   * Internal Execution Logic
   * Runs the Aggregation and Transforms the Data
   */
  async _runPipeline(ruleConfig, organizationId) {
    const { pipeline, sort, limit } = RuleQueryBuilder.build(ruleConfig, organizationId);

    // Aggregate with Projection
    const products = await Product.aggregate([
      ...pipeline,
      { $sort: sort },
      { $limit: limit },
      
      // OPTIMIZATION: Lookups (Join)
      // Only join what is strictly necessary for the card display
      {
        $lookup: {
          from: 'masters', // Assuming collection name is plural 'masters'
          localField: 'categoryId',
          foreignField: '_id',
          as: 'category'
        }
      },
      {
        $lookup: {
          from: 'masters',
          localField: 'brandId',
          foreignField: '_id',
          as: 'brand'
        }
      },
      
      // Flatten the Lookups (Unwind)
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$brand", preserveNullAndEmptyArrays: true } },

      // Project only what UI needs (Optimization)
      {
        $project: {
          name: 1, 
          slug: 1, 
          sellingPrice: 1, 
          discountedPrice: 1, 
          images: 1, 
          sku: 1,
          'category.name': 1, // Only need the name
          'category.slug': 1,
          'brand.name': 1,
          'inventory.quantity': 1,
          tags: 1
        }
      }
    ]);

    return this._transformForPublic(products);
  }

  /**
   * Transform DB objects to Safe Public DTOs
   * Strips internal IDs, cost prices, supplier info, etc.
   */
  _transformForPublic(products) {
    return products.map(p => {
      // Logic for total stock availability
      const totalStock = p.inventory?.reduce((acc, curr) => acc + (curr.quantity || 0), 0) || 0;
      const isAvailable = totalStock > 0;

      // Discount Calculation
      const originalPrice = p.sellingPrice;
      const salePrice = p.discountedPrice;
      const hasDiscount = salePrice && salePrice < originalPrice;
      const discountPercentage = hasDiscount 
        ? Math.round(((originalPrice - salePrice) / originalPrice) * 100) 
        : 0;

      return {
        id: p._id, // Exposed ID for routing
        name: p.name,
        slug: p.slug,
        sku: p.sku,
        
        // Image Handling (First image is primary)
        image: p.images?.[0] || null, 
        images: p.images || [],

        // Price Object
        price: {
          original: originalPrice,
          current: hasDiscount ? salePrice : originalPrice,
          hasDiscount: hasDiscount,
          discountPercentage: hasDiscount ? discountPercentage : 0,
          currency: 'INR' // Or dynamic if multi-currency supported
        },

        // Meta
        category: p.category?.name || 'Uncategorized',
        brand: p.brand?.name || null,
        tags: p.tags || [],
        
        // Stock Status (Boolean only, hide exact count for public)
        isAvailable: isAvailable,
        stockLabel: isAvailable ? 'In Stock' : 'Out of Stock'
      };
    });
  }

  async _updateStats(ruleId) {
    try {
      await SmartRule.findByIdAndUpdate(ruleId, { 
        $inc: { executionCount: 1 }, 
        $set: { lastExecutedAt: new Date() } 
      });
    } catch (e) { /* ignore analytics errors */ }
  }
}

module.exports = new SmartRuleEngine();