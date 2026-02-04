// FIX: Removed curly braces
const Product = require('../../../modules/inventory/core/product.model');
const { SmartRule } = require('../../models/storefront');
const RuleQueryBuilder = require('./ruleQueryBuilder.service');
const AppError = require('../../../core/utils/appError');
const redis = require('../../../core/utils/_legacy/redis');

class SmartRuleEngine {
  constructor() { this.cachePrefix = 'smartrule:v1'; this.cacheEnabled = true; this.MAX_LIMIT = 50; }

  async executeRule(ruleId, organizationId, options = {}) {
    const start = Date.now();
    const rule = await SmartRule.findOne({ _id: ruleId, organizationId, isActive: true }).lean();
    if (!rule) {
      throw new AppError('Smart rule not found or inactive', 404);
    }
    const cacheKey = this.buildCacheKey(ruleId, organizationId);
    if (this.cacheEnabled) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        this.logExecution(ruleId, 'cache-hit', Date.now() - start);
        return JSON.parse(cached);
      }
    }
    const query = RuleQueryBuilder.build(rule, organizationId);
    const finalLimit = options.limit ? Math.min(parseInt(options.limit), this.MAX_LIMIT) : Math.min(query.limit, this.MAX_LIMIT);
    const products = await Product.aggregate([...query.pipeline, { $sort: query.sort }, { $limit: finalLimit }]);
    const result = this.transform(products);
    await this.updateRuleStats(ruleId);
    if (this.cacheEnabled) {
      await redis.setex(cacheKey, (rule.cacheDuration || 15) * 60, JSON.stringify(result));
    }
    this.logExecution(ruleId, 'db-hit', Date.now() - start);
    return result;
  }
  async previewRule(ruleData, organizationId, limit = 5) {
    const tempRule = {
      ...ruleData,
      limit: Math.min(limit, this.MAX_LIMIT)
    };

    const query = RuleQueryBuilder.build(tempRule, organizationId);
    const products = await Product.aggregate([...query.pipeline, { $sort: query.sort }, { $limit: tempRule.limit }]);

    return {
      preview: this.transform(products),
      estimatedResults: products.length
    };
  }

  async clearRuleCache(ruleId, organizationId) {
    const key = this.buildCacheKey(ruleId, organizationId);
    await redis.del(key);
  }

  async clearOrganizationCache(organizationId) {
    const keys = await redis.keys(`${this.cachePrefix}:*:${organizationId}`); if (keys.length) { await redis.del(keys); }
  }

  buildCacheKey(ruleId, organizationId) { return `${this.cachePrefix}:${organizationId}:${ruleId}`; }

  async updateRuleStats(ruleId) {
    await SmartRule.findByIdAndUpdate(ruleId, {
      $inc: { executionCount: 1 },
      $set: { lastExecutedAt: new Date() }
    });
  }

  transform(products) {
    return products.map(p => ({
      id: p._id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      images: p.images || [],
      price: {
        original: p.sellingPrice,
        discounted: p.discountedPrice,
        currency: 'USD',
        hasDiscount:
          p.discountedPrice &&
          p.discountedPrice < p.sellingPrice
      },
      category: p.category,
      tags: p.tags || [],
      sku: p.sku,
      stock: {
        available: p.inventory?.some(i => i.quantity > 0) || false
      }
    }));
  }

  logExecution(ruleId, source, durationMs) {
    console.log('[SmartRule]', {
      ruleId,
      source,
      durationMs,
      at: new Date().toISOString()
    });
  }
  /**
   * Execute a rule defined directly in JSON config (No DB lookup)
   */
  async executeAdHocRule(config, organizationId) {
    const start = Date.now();

    // 1. Construct a temporary rule object that matches the Schema structure
    const adHocRule = {
      ruleType: config.ruleType,
      limit: parseInt(config.limit || config.itemsPerView || 10),
      sortBy: 'createdAt', // Default sort
      sortOrder: 'desc',
      filters: []
    };

    // 2. Build the query using your existing Service
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
}

module.exports = new SmartRuleEngine();
