// src/services/storefront/smartRuleEngine.service.js

const { Product } = require('../../../modules/inventory/core/product.model');
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

  // =====================================================
  // PUBLIC API
  // =====================================================

  async executeRule(ruleId, organizationId) {
    const start = Date.now();

    const rule = await SmartRule.findOne({
      _id: ruleId,
      organizationId,
      isActive: true
    }).lean();

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

    // LOGIC FIX: Prefer option limit over rule limit
    const finalLimit = options.limit 
        ? Math.min(parseInt(options.limit), this.MAX_LIMIT)
        : Math.min(query.limit, this.MAX_LIMIT);

    const products = await Product.aggregate([
      ...query.pipeline,
      { $sort: query.sort },
      { $limit: finalLimit } // Use the calculated limit
    ]);
    
    // const query = RuleQueryBuilder.build(rule, organizationId);

    // const products = await Product.aggregate([
    //   ...query.pipeline,
    //   { $sort: query.sort },
    //   { $limit: Math.min(query.limit, this.MAX_LIMIT) }
    // ]);

    const result = this.transform(products);

    await this.updateRuleStats(ruleId);

    if (this.cacheEnabled) {
      await redis.setex(
        cacheKey,
        (rule.cacheDuration || 15) * 60,
        JSON.stringify(result)
      );
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

    const products = await Product.aggregate([
      ...query.pipeline,
      { $sort: query.sort },
      { $limit: tempRule.limit }
    ]);

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
    const keys = await redis.keys(`${this.cachePrefix}:*:${organizationId}`);
    if (keys.length) {
      await redis.del(keys);
    }
  }

  // =====================================================
  // INTERNALS
  // =====================================================

  buildCacheKey(ruleId, organizationId) {
    return `${this.cachePrefix}:${organizationId}:${ruleId}`;
  }

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
    // Replace with structured logger later
    console.log('[SmartRule]', {
      ruleId,
      source,
      durationMs,
      at: new Date().toISOString()
    });
  }
}

module.exports = new SmartRuleEngine();


// // src/services/storefront/smartRuleEngine.service.js
// const { Product } = require('../../../modules/inventory/core/product.model');
// const { Organization } = require('../../../modules/organization/core/organization.model');
// const { SmartRule } = require('../../models/storefront');
// const AppError = require('../../../core/utils/appError');
// const { SMART_RULE_TYPES } = require('../../utils/constants/sectionTypes.constants');
// const redis = require('../../../core/utils/_legacy/redis');

// class SmartRuleEngine {
//   constructor() {
//     this.cacheEnabled = true;
//     this.cachePrefix = 'smartrule:';
//   }

//   /**
//    * Execute a smart rule and return products
//    * @param {string} ruleId - Smart Rule ID
//    * @param {string} organizationId - Organization ID
//    * @returns {Promise<Array>} Array of products
//    */
//   async executeRule(ruleId, organizationId) {
//     try {
//       // Check cache first
//       const cacheKey = `${this.cachePrefix}${ruleId}:${organizationId}`;
//       if (this.cacheEnabled) {
//         const cached = await redis.get(cacheKey);
//         if (cached) {
//           return JSON.parse(cached);
//         }
//       }

//       // Get the rule
//       const rule = await SmartRule.findOne({
//         _id: ruleId,
//         organizationId,
//         isActive: true
//       });

//       if (!rule) {
//         throw new AppError('Smart rule not found or inactive', 404);
//       }

//       // Execute based on rule type
//       let products = [];
//       switch (rule.ruleType) {
//         case SMART_RULE_TYPES.NEW_ARRIVALS:
//           products = await this.executeNewArrivals(rule, organizationId);
//           break;
        
//         case SMART_RULE_TYPES.BEST_SELLERS:
//           products = await this.executeBestSellers(rule, organizationId);
//           break;
        
//         case SMART_RULE_TYPES.CLEARANCE_SALE:
//           products = await this.executeClearanceSale(rule, organizationId);
//           break;
        
//         case SMART_RULE_TYPES.TRENDING:
//           products = await this.executeTrending(rule, organizationId);
//           break;
        
//         case SMART_RULE_TYPES.SEASONAL:
//           products = await this.executeSeasonal(rule, organizationId);
//           break;
        
//         case SMART_RULE_TYPES.CATEGORY_BASED:
//           products = await this.executeCategoryBased(rule, organizationId);
//           break;
        
//         case SMART_RULE_TYPES.LOW_STOCK:
//           products = await this.executeLowStock(rule, organizationId);
//           break;
        
//         case SMART_RULE_TYPES.HIGH_MARGIN:
//           products = await this.executeHighMargin(rule, organizationId);
//           break;
        
//         case SMART_RULE_TYPES.CUSTOM_QUERY:
//           products = await this.executeCustomQuery(rule, organizationId);
//           break;
        
//         case SMART_RULE_TYPES.PRICE_RANGE:
//           products = await this.executePriceRange(rule, organizationId);
//           break;
        
//         default:
//           products = await this.executeGenericRule(rule, organizationId);
//       }

//       // Apply additional filters
//       if (rule.filters && rule.filters.length > 0) {
//         products = await this.applyAdditionalFilters(products, rule.filters);
//       }

//       // Sort products
//       products = this.sortProducts(products, rule.sortBy, rule.sortOrder);

//       // Apply limit
//       if (rule.limit && products.length > rule.limit) {
//         products = products.slice(0, rule.limit);
//       }

//       // Update rule execution stats
//       await this.updateRuleStats(ruleId);

//       // Cache the results
//       if (this.cacheEnabled) {
//         await redis.setex(
//           cacheKey, 
//           rule.cacheDuration * 60 || 900, // Default 15 minutes
//           JSON.stringify(products)
//         );
//       }

//       return products;

//     } catch (error) {
//       console.error('SmartRuleEngine Error:', error);
//       throw new AppError(`Failed to execute smart rule: ${error.message}`, 500);
//     }
//   }

//   /**
//    * Execute New Arrivals rule
//    */
//   async executeNewArrivals(rule, organizationId) {
//     const daysAgo = this.getDaysAgoFromFilter(rule.filters, 'createdAt') || 30;
//     const dateThreshold = new Date();
//     dateThreshold.setDate(dateThreshold.getDate() - daysAgo);

//     const query = {
//       organizationId,
//       isActive: true,
//       createdAt: { $gte: dateThreshold }
//     };

//     return await Product.find(query)
//       .select('name slug description images sellingPrice discountedPrice category tags inventory')
//       .lean();
//   }

//   /**
//    * Execute Best Sellers rule
//    */
//   async executeBestSellers(rule, organizationId) {
//     const daysAgo = this.getDaysAgoFromFilter(rule.filters, 'lastSold') || 90;
//     const dateThreshold = new Date();
//     dateThreshold.setDate(dateThreshold.getDate() - daysAgo);

//     const query = {
//       organizationId,
//       isActive: true,
//       lastSold: { 
//         $exists: true,
//         $ne: null,
//         $gte: dateThreshold 
//       }
//     };

//     return await Product.find(query)
//       .select('name slug description images sellingPrice discountedPrice category tags inventory')
//       .sort({ lastSold: -1 })
//       .lean();
//   }

//   /**
//    * Execute Clearance Sale rule
//    */
//   async executeClearanceSale(rule, organizationId) {
//     const query = {
//       organizationId,
//       isActive: true,
//       discountedPrice: { 
//         $exists: true,
//         $ne: null,
//         $lt: { $ifNull: ['$sellingPrice', 0] }
//       }
//     };

//     // Calculate discount percentage
//     const products = await Product.aggregate([
//       { $match: query },
//       {
//         $addFields: {
//           discountPercent: {
//             $multiply: [
//               {
//                 $divide: [
//                   { $subtract: ['$sellingPrice', '$discountedPrice'] },
//                   '$sellingPrice'
//                 ]
//               },
//               100
//             ]
//           }
//         }
//       },
//       { $match: { discountPercent: { $gte: 10 } } }, // At least 10% discount
//       { $sort: { discountPercent: -1 } }
//     ]);

//     return products;
//   }

//   /**
//    * Execute Trending rule
//    */
//   async executeTrending(rule, organizationId) {
//     // This would use actual view/sales data
//     // For now, we'll use products sold in last 7 days
//     const dateThreshold = new Date();
//     dateThreshold.setDate(dateThreshold.getDate() - 7);

//     const query = {
//       organizationId,
//       isActive: true,
//       lastSold: { $gte: dateThreshold }
//     };

//     return await Product.find(query)
//       .select('name slug description images sellingPrice discountedPrice category tags inventory')
//       .sort({ lastSold: -1 })
//       .lean();
//   }

//   /**
//    * Execute Seasonal rule
//    */
//   async executeSeasonal(rule, organizationId) {
//     const currentMonth = new Date().getMonth() + 1;
//     const season = this.getSeasonFromMonth(currentMonth);
    
//     const query = {
//       organizationId,
//       isActive: true,
//       $or: [
//         { tags: { $in: [season.toLowerCase()] } },
//         { tags: { $in: [this.getSeasonKeywords(season)] } },
//         { category: { $regex: season, $options: 'i' } }
//       ]
//     };

//     return await Product.find(query)
//       .select('name slug description images sellingPrice discountedPrice category tags inventory')
//       .lean();
//   }

//   /**
//    * Execute Category Based rule
//    */
//   async executeCategoryBased(rule, organizationId) {
//     const categoryFilter = this.getFilterValue(rule.filters, 'category');
//     if (!categoryFilter) {
//       throw new AppError('Category filter required for category-based rule', 400);
//     }

//     const query = {
//       organizationId,
//       isActive: true,
//       category: categoryFilter
//     };

//     return await Product.find(query)
//       .select('name slug description images sellingPrice discountedPrice category tags inventory')
//       .lean();
//   }

//   /**
//    * Execute Low Stock rule
//    */
//   async executeLowStock(rule, organizationId) {
//     const threshold = this.getFilterValue(rule.filters, 'quantity') || 10;

//     const query = {
//       organizationId,
//       isActive: true,
//       'inventory.quantity': { $lte: threshold }
//     };

//     return await Product.find(query)
//       .select('name slug description images sellingPrice discountedPrice category tags inventory')
//       .lean();
//   }

//   /**
//    * Execute High Margin rule
//    */
//   async executeHighMargin(rule, organizationId) {
//     // This requires purchasePrice field to be available
//     // For now, we'll use products with highest selling price
//     const query = {
//       organizationId,
//       isActive: true,
//       sellingPrice: { $gt: 0 }
//     };

//     return await Product.find(query)
//       .select('name slug description images sellingPrice discountedPrice category tags inventory')
//       .sort({ sellingPrice: -1 })
//       .lean();
//   }

//   /**
//    * Execute Price Range rule
//    */
//   async executePriceRange(rule, organizationId) {
//     const minPrice = this.getFilterValue(rule.filters, 'price', 'min') || 0;
//     const maxPrice = this.getFilterValue(rule.filters, 'price', 'max') || 999999;

//     const query = {
//       organizationId,
//       isActive: true,
//       sellingPrice: { $gte: minPrice, $lte: maxPrice }
//     };

//     return await Product.find(query)
//       .select('name slug description images sellingPrice discountedPrice category tags inventory')
//       .lean();
//   }

//   /**
//    * Execute Custom Query rule
//    */
//   async executeCustomQuery(rule, organizationId) {
//     const query = {
//       organizationId,
//       isActive: true
//     };

//     // Apply all custom filters
//     if (rule.filters && rule.filters.length > 0) {
//       rule.filters.forEach(filter => {
//         this.applyFilterToQuery(query, filter);
//       });
//     }

//     return await Product.find(query)
//       .select('name slug description images sellingPrice discountedPrice category tags inventory')
//       .lean();
//   }

//   /**
//    * Execute Generic Rule (fallback)
//    */
//   async executeGenericRule(rule, organizationId) {
//     const query = {
//       organizationId,
//       isActive: true
//     };

//     return await Product.find(query)
//       .select('name slug description images sellingPrice discountedPrice category tags inventory')
//       .lean();
//   }

//   /**
//    * Apply additional filters to already fetched products
//    */
//   async applyAdditionalFilters(products, filters) {
//     return products.filter(product => {
//       return filters.every(filter => {
//         return this.evaluateFilter(product, filter);
//       });
//     });
//   }

//   /**
//    * Evaluate a single filter against a product
//    */
//   evaluateFilter(product, filter) {
//     const { field, operator, value, value2 } = filter;
//     const productValue = this.getNestedValue(product, field);

//     switch (operator) {
//       case 'equals':
//         return productValue == value;
      
//       case 'not_equals':
//         return productValue != value;
      
//       case 'contains':
//         return String(productValue).toLowerCase().includes(String(value).toLowerCase());
      
//       case 'greater_than':
//         return Number(productValue) > Number(value);
      
//       case 'less_than':
//         return Number(productValue) < Number(value);
      
//       case 'between':
//         return Number(productValue) >= Number(value) && 
//                Number(productValue) <= Number(value2);
      
//       case 'in':
//         return Array.isArray(value) && value.includes(productValue);
      
//       case 'not_in':
//         return Array.isArray(value) && !value.includes(productValue);
      
//       case 'exists':
//         return value ? productValue !== undefined : productValue === undefined;
      
//       default:
//         return true;
//     }
//   }

//   /**
//    * Sort products based on rule
//    */
//   sortProducts(products, sortBy, sortOrder) {
//     const order = sortOrder === 'asc' ? 1 : -1;
    
//     return products.sort((a, b) => {
//       const aValue = this.getNestedValue(a, sortBy);
//       const bValue = this.getNestedValue(b, sortBy);
      
//       if (aValue < bValue) return -1 * order;
//       if (aValue > bValue) return 1 * order;
//       return 0;
//     });
//   }

//   /**
//    * Update rule execution statistics
//    */
//   async updateRuleStats(ruleId) {
//     try {
//       await SmartRule.findByIdAndUpdate(ruleId, {
//         $inc: { executionCount: 1 },
//         $set: { lastExecutedAt: new Date() }
//       });
//     } catch (error) {
//       console.error('Error updating rule stats:', error);
//     }
//   }

//   /**
//    * Get value from nested object
//    */
//   getNestedValue(obj, path) {
//     return path.split('.').reduce((current, key) => {
//       return current ? current[key] : undefined;
//     }, obj);
//   }

//   /**
//    * Get filter value from filters array
//    */
//   getFilterValue(filters, field, type = 'value') {
//     if (!filters || !Array.isArray(filters)) return null;
    
//     const filter = filters.find(f => f.field === field);
//     if (!filter) return null;
    
//     return type === 'value' ? filter.value : filter.value2;
//   }

//   /**
//    * Get days ago from date filter
//    */
//   getDaysAgoFromFilter(filters, field) {
//     const value = this.getFilterValue(filters, field);
//     if (!value) return null;
    
//     // Handle values like "30d", "7d", "90d"
//     if (typeof value === 'string' && value.endsWith('d')) {
//       return parseInt(value);
//     }
    
//     return null;
//   }

//   /**
//    * Get season from month
//    */
//   getSeasonFromMonth(month) {
//     switch (month) {
//       case 12:
//       case 1:
//       case 2:
//         return 'winter';
//       case 3:
//       case 4:
//       case 5:
//         return 'spring';
//       case 6:
//       case 7:
//       case 8:
//         return 'summer';
//       case 9:
//       case 10:
//       case 11:
//         return 'fall';
//       default:
//         return 'all';
//     }
//   }

//   /**
//    * Get season keywords
//    */
//   getSeasonKeywords(season) {
//     const keywords = {
//       winter: ['cold', 'snow', 'holiday', 'christmas', 'newyear'],
//       spring: ['flower', 'bloom', 'fresh', 'renewal', 'easter'],
//       summer: ['hot', 'beach', 'sun', 'vacation', 'outdoor'],
//       fall: ['autumn', 'leaf', 'harvest', 'thanksgiving', 'cozy']
//     };
    
//     return keywords[season] || [];
//   }

//   /**
//    * Apply filter to MongoDB query
//    */
//   applyFilterToQuery(query, filter) {
//     const { field, operator, value, value2 } = filter;
    
//     switch (operator) {
//       case 'equals':
//         query[field] = value;
//         break;
      
//       case 'not_equals':
//         query[field] = { $ne: value };
//         break;
      
//       case 'contains':
//         query[field] = { $regex: value, $options: 'i' };
//         break;
      
//       case 'greater_than':
//         query[field] = { $gt: Number(value) };
//         break;
      
//       case 'less_than':
//         query[field] = { $lt: Number(value) };
//         break;
      
//       case 'between':
//         query[field] = { $gte: Number(value), $lte: Number(value2) };
//         break;
      
//       case 'in':
//         query[field] = { $in: Array.isArray(value) ? value : [value] };
//         break;
      
//       case 'not_in':
//         query[field] = { $nin: Array.isArray(value) ? value : [value] };
//         break;
      
//       case 'exists':
//         if (value) {
//           query[field] = { $exists: true, $ne: null };
//         } else {
//           query[field] = { $exists: false };
//         }
//         break;
//     }
//   }

//   /**
//    * Preview rule results without executing
//    */
//   async previewRule(ruleData, organizationId, limit = 5) {
//     try {
//       // Create a temporary rule object
//       const tempRule = {
//         ...ruleData,
//         limit: limit
//       };

//       // Execute the rule
//       const products = await this.executeRuleLogic(tempRule, organizationId);
      
//       // Return preview with metadata
//       return {
//         preview: products,
//         estimatedResults: await this.estimateResultCount(tempRule, organizationId),
//         executionTime: Date.now()
//       };
//     } catch (error) {
//       throw new AppError(`Failed to preview rule: ${error.message}`, 500);
//     }
//   }

//   /**
//    * Estimate result count without fetching all data
//    */
//   async estimateResultCount(rule, organizationId) {
//     try {
//       const query = this.buildBaseQuery(rule, organizationId);
//       return await Product.countDocuments(query);
//     } catch (error) {
//       console.error('Error estimating result count:', error);
//       return 0;
//     }
//   }

//   /**
//    * Build base MongoDB query for rule
//    */
//   buildBaseQuery(rule, organizationId) {
//     const query = {
//       organizationId,
//       isActive: true
//     };

//     // Apply filters based on rule type
//     switch (rule.ruleType) {
//       case SMART_RULE_TYPES.NEW_ARRIVALS:
//         const daysAgo = this.getDaysAgoFromFilter(rule.filters, 'createdAt') || 30;
//         const dateThreshold = new Date();
//         dateThreshold.setDate(dateThreshold.getDate() - daysAgo);
//         query.createdAt = { $gte: dateThreshold };
//         break;
      
//       case SMART_RULE_TYPES.CLEARANCE_SALE:
//         query.discountedPrice = { 
//           $exists: true,
//           $ne: null,
//           $lt: { $ifNull: ['$sellingPrice', 0] }
//         };
//         break;
      
//       case SMART_RULE_TYPES.LOW_STOCK:
//         const threshold = this.getFilterValue(rule.filters, 'quantity') || 10;
//         query['inventory.quantity'] = { $lte: threshold };
//         break;
//     }

//     // Apply additional filters
//     if (rule.filters && rule.filters.length > 0) {
//       rule.filters.forEach(filter => {
//         this.applyFilterToQuery(query, filter);
//       });
//     }

//     return query;
//   }

//   /**
//    * Clear cache for a specific rule
//    */
//   async clearRuleCache(ruleId, organizationId) {
//     if (!this.cacheEnabled) return;
    
//     const cacheKey = `${this.cachePrefix}${ruleId}:${organizationId}`;
//     await redis.del(cacheKey);
//   }

//   /**
//    * Clear all cache for an organization
//    */
//   async clearOrganizationCache(organizationId) {
//     if (!this.cacheEnabled) return;
    
//     const pattern = `${this.cachePrefix}*:${organizationId}`;
//     const keys = await redis.keys(pattern);
    
//     if (keys.length > 0) {
//       await redis.del(keys);
//     }
//   }

//   /**
//    * Get rule performance analytics
//    */
//   async getRuleAnalytics(ruleId, organizationId, period = '30d') {
//     const rule = await SmartRule.findOne({
//       _id: ruleId,
//       organizationId
//     }).select('name ruleType executionCount lastExecutedAt');

//     if (!rule) {
//       throw new AppError('Rule not found', 404);
//     }

//     // Get products from the rule (cached)
//     const products = await this.executeRule(ruleId, organizationId);

//     // Calculate basic analytics
//     const analytics = {
//       ruleName: rule.name,
//       ruleType: rule.ruleType,
//       executionCount: rule.executionCount,
//       lastExecutedAt: rule.lastExecutedAt,
//       productCount: products.length,
//       averagePrice: this.calculateAveragePrice(products),
//       totalValue: this.calculateTotalValue(products),
//       categories: this.extractCategories(products)
//     };

//     return analytics;
//   }

//   /**
//    * Calculate average price
//    */
//   calculateAveragePrice(products) {
//     if (products.length === 0) return 0;
    
//     const total = products.reduce((sum, product) => {
//       return sum + (product.discountedPrice || product.sellingPrice || 0);
//     }, 0);
    
//     return total / products.length;
//   }

//   /**
//    * Calculate total value
//    */
//   calculateTotalValue(products) {
//     return products.reduce((sum, product) => {
//       const price = product.discountedPrice || product.sellingPrice || 0;
//       const stock = product.inventory?.reduce((total, inv) => total + (inv.quantity || 0), 0) || 0;
//       return sum + (price * stock);
//     }, 0);
//   }

//   /**
//    * Extract unique categories
//    */
//   extractCategories(products) {
//     const categories = {};
    
//     products.forEach(product => {
//       if (product.category) {
//         categories[product.category] = (categories[product.category] || 0) + 1;
//       }
//     });
    
//     return Object.entries(categories)
//       .map(([name, count]) => ({ name, count }))
//       .sort((a, b) => b.count - a.count);
//   }

//   /**
//    * Create a smart rule from template
//    */
//   async createRuleFromTemplate(templateName, organizationId, customizations = {}) {
//     const templates = {
//       'new_arrivals_30d': {
//         name: 'New Arrivals (Last 30 Days)',
//         ruleType: 'new_arrivals',
//         filters: [
//           { field: 'createdAt', operator: 'greater_than', value: '30d' }
//         ],
//         sortBy: 'createdAt',
//         sortOrder: 'desc',
//         limit: 10
//       },
//       'best_sellers_90d': {
//         name: 'Best Sellers (Last 90 Days)',
//         ruleType: 'best_sellers',
//         filters: [
//           { field: 'lastSold', operator: 'greater_than', value: '90d' }
//         ],
//         sortBy: 'lastSold',
//         sortOrder: 'desc',
//         limit: 8
//       },
//       'clearance_20pct': {
//         name: 'Clearance (20%+ Off)',
//         ruleType: 'clearance_sale',
//         filters: [],
//         sortBy: 'discountedPrice',
//         sortOrder: 'asc',
//         limit: 12
//       },
//       'low_stock_alert': {
//         name: 'Low Stock Alert',
//         ruleType: 'low_stock',
//         filters: [
//           { field: 'inventory.quantity', operator: 'less_than', value: 10 }
//         ],
//         sortBy: 'inventory.quantity',
//         sortOrder: 'asc',
//         limit: 15
//       }
//     };

//     const template = templates[templateName];
//     if (!template) {
//       throw new AppError(`Template ${templateName} not found`, 404);
//     }

//     const ruleData = {
//       ...template,
//       ...customizations,
//       organizationId,
//       isActive: true
//     };

//     const rule = new SmartRule(ruleData);
//     await rule.save();

//     return rule;
//   }
// }

// module.exports = new SmartRuleEngine();