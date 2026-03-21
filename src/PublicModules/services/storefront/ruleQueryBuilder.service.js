<<<<<<< HEAD
const AppError = require('../../../core/utils/appError');
=======
const mongoose = require('mongoose');
const AppError = require('../../../core/utils/api/appError');
>>>>>>> f866ea5f98b08ee23003c9b4ccea5ff507d78be8

// Constants defined locally for robustness
const SMART_RULE_TYPES = {
  NEW_ARRIVALS: 'new_arrivals',
  BEST_SELLERS: 'best_sellers',
  CLEARANCE_SALE: 'clearance_sale',
  TRENDING: 'trending',
  CATEGORY_BASED: 'category_based',
  LOW_STOCK: 'low_stock',
  PRICE_RANGE: 'price_range',
  CUSTOM_QUERY: 'custom_query'
};

class RuleQueryBuilder {
<<<<<<< HEAD
  /**
   * Builds the Aggregation Pipeline for a Smart Rule
   * @param {Object} rule - The rule object (from DB or Ad-Hoc config)
=======

  /**
   * Main Entry Point
   * Builds a MongoDB Aggregation Pipeline from a Rule Configuration
   * @param {Object} rule - The SmartRule object or ad-hoc config
>>>>>>> f866ea5f98b08ee23003c9b4ccea5ff507d78be8
   * @param {String} organizationId 
   */
  build(rule, organizationId) {
    // Debug Log
    if (process.env.NODE_ENV === 'development') {
      console.log('[RuleQueryBuilder] Building:', { type: rule?.ruleType, org: organizationId, manualIds: rule?.manualProductIds?.length });
    }

    if (!rule || !organizationId) {
      throw new AppError('Invalid rule execution context', 400);
    }

    // 1. Base Match (Security: Always filter by Org & Active status)
    const matchStage = {
      organizationId: new mongoose.Types.ObjectId(organizationId),
      isActive: true,
      $or: [{ isDeleted: { $exists: false } }, { isDeleted: false }] 
    };

<<<<<<< HEAD
    // PRO FEATURE: Exclude specific products (e.g. if they are manually pinned at the top)
    if (rule.excludedProductIds && rule.excludedProductIds.length > 0) {
      match._id = { $nin: rule.excludedProductIds };
    }

    const pipeline = [];
=======
    let sortStage = { createdAt: -1 }; // Default Sort
    let limit = rule.limit || 12;      // Default Limit
>>>>>>> f866ea5f98b08ee23003c9b4ccea5ff507d78be8

    // 2. Apply Rule Strategy
    switch (rule.ruleType) {
      
      // --- MANUAL SELECTION ---
      case 'manual_selection':
        // Ensure manualProductIds exists and is an array
        if (Array.isArray(rule.manualProductIds) && rule.manualProductIds.length > 0) {
          try {
            // Robust ID conversion (Handle strings, objects with .value, or already ObjectIds)
            const objectIds = rule.manualProductIds
              .map(id => {
                if (mongoose.isValidObjectId(id)) return new mongoose.Types.ObjectId(id);
                if (typeof id === 'string' && id.length === 24) return new mongoose.Types.ObjectId(id);
                if (typeof id === 'object' && id.value) return new mongoose.Types.ObjectId(id.value);
                return null;
              })
              .filter(id => id !== null);

            matchStage._id = { $in: objectIds };
            
            // Override limit to ensure all selected items are returned
            limit = objectIds.length > 0 ? objectIds.length : 12;
            
            // Optimization: If no valid IDs found, ensure we return nothing
            if (objectIds.length === 0) matchStage._id = { $in: [] };

<<<<<<< HEAD
      case SMART_RULE_TYPES.CLEARANCE_SALE:
        // Clearance logic is complex (math), so it returns pipeline stages
        pipeline.push(...this.clearanceSale());
        break;

      case SMART_RULE_TYPES.TRENDING:
        this.trending(match);
        break;

      case SMART_RULE_TYPES.CATEGORY_BASED:
        this.categoryBased(match, rule);
        break;

      case SMART_RULE_TYPES.LOW_STOCK:
        this.lowStock(match, rule);
        break;

      case SMART_RULE_TYPES.PRICE_RANGE:
        this.priceRange(match, rule);
        break;

      case SMART_RULE_TYPES.CUSTOM_QUERY:
        this.applyFilters(match, rule.filters);
        break;

      default:
        break;
    }

    // Apply any additional filters defined in the rule
    this.applyFilters(match, rule.filters);

    return {
      pipeline: pipeline.length
        ? [{ $match: match }, ...pipeline]
        : [{ $match: match }],
      sort: this.buildSort(rule),
      limit: Math.min(rule.limit || 12, 50)
    };
  }

  buildSort(rule) {
    return {
      [rule.sortBy || 'createdAt']: rule.sortOrder === 'asc' ? 1 : -1
    };
  }

  // --- Rule Logic Implementation ---

  newArrivals(match, rule) {
    const days = this.getDays(rule.filters, 'createdAt') || 30;
    const date = new Date();
    date.setDate(date.getDate() - days);
    match.createdAt = { $gte: date };
  }

  bestSellers(match, rule) {
    const days = this.getDays(rule.filters, 'lastSold');
    if (days) {
      const date = new Date();
      date.setDate(date.getDate() - days);
      match.lastSold = { $gte: date };
    }

    // Force sort by sales count if using best sellers
    // Note: Ensure your Product model tracks 'salesCount' or 'views'
    rule.sortBy = 'salesCount'; 
    rule.sortOrder = 'desc';
  }

  trending(match) {
    const date = new Date();
    date.setDate(date.getDate() - 7); // Last 7 days
    match.lastSold = { $gte: date };
  }

  categoryBased(match, rule) {
    const category = this.getFilter(rule.filters, 'category');
    if (!category) {
      // In ad-hoc mode, this might be handled by the Resolver, but good to have check
      // throw new AppError('Category filter required', 400); 
    } else {
      match.categoryId = category; // Assuming ID is passed
    }
  }

  lowStock(match, rule) {
    const threshold = this.getFilter(rule.filters, 'quantity') || 5;
    match.inventory = {
      $elemMatch: { quantity: { $lte: threshold, $gt: 0 } }
    };
  }

  priceRange(match, rule) {
    const min = this.getFilter(rule.filters, 'price_min') || 0;
    const max = this.getFilter(rule.filters, 'price_max') || 999999;
    match.sellingPrice = { $gte: min, $lte: max };
  }

  clearanceSale() {
    return [
      {
        $addFields: {
          discountPercent: {
            $cond: {
              if: { $gt: ['$sellingPrice', 0] },
              then: {
                $multiply: [
                  {
                    $divide: [
                      { $subtract: ['$sellingPrice', '$discountedPrice'] },
                      '$sellingPrice'
                    ]
                  },
                  100
                ]
              },
              else: 0
            }
=======
          } catch (e) {
            console.error('[RuleQueryBuilder] Error parsing manual IDs:', e);
            matchStage._id = { $in: [] }; 
>>>>>>> f866ea5f98b08ee23003c9b4ccea5ff507d78be8
          }
        } else {
          // Fallback: If manual type selected but no IDs provided, return nothing
          matchStage._id = { $in: [] }; 
        }
<<<<<<< HEAD
      },
      {
        $match: { discountPercent: { $gte: 10 } } // Minimum 10% off
      },
      {
        $sort: { discountPercent: -1 }
      }
    ];
  }

  // --- Helpers ---

  applyFilters(match, filters = []) {
    if (!filters) return;
    
    filters.forEach(f => {
      if (!f.field || !f.operator) return;

      switch (f.operator) {
        case 'equals':
          match[f.field] = f.value;
          break;
        case 'greater_than':
          match[f.field] = { $gt: f.value };
          break;
        case 'less_than':
          match[f.field] = { $lt: f.value };
          break;
        case 'in':
          match[f.field] = { $in: Array.isArray(f.value) ? f.value : [f.value] };
          break;
        case 'contains':
           match[f.field] = { $regex: f.value, $options: 'i' };
           break;
      }
    });
  }
=======
        break;

      // --- SMART STRATEGIES ---
      case 'new_arrivals':
        sortStage = { createdAt: -1 };
        break;

      case 'best_sellers':
        // Sort by sales count (descending)
        sortStage = { 'analytics.salesCount': -1, lastSold: -1 };
        matchStage['analytics.salesCount'] = { $gt: 0 };
        break;
>>>>>>> f866ea5f98b08ee23003c9b4ccea5ff507d78be8

      case 'trending':
        // Products viewed/sold recently (e.g., last 30 days)
        const trendingWindow = new Date();
        trendingWindow.setDate(trendingWindow.getDate() - 30);
        
        matchStage.$or = [
          { lastSold: { $gte: trendingWindow } },
          { updatedAt: { $gte: trendingWindow } }
        ];
        sortStage = { lastSold: -1, viewCount: -1 };
        break;

      case 'clearance_sale':
        // Products with a discount > 0
        matchStage.discountedPrice = { $exists: true, $ne: null };
        matchStage.$expr = { $lt: ["$discountedPrice", "$sellingPrice"] };
        sortStage = { discountedPrice: 1 };
        break;

      case 'category_based':
        // Explicit Category ID check
        if (rule.categoryId) {
           // Handle both string ID and {value: id} format
           const catId = typeof rule.categoryId === 'object' && rule.categoryId.value 
             ? rule.categoryId.value 
             : rule.categoryId;
             
           if (mongoose.isValidObjectId(catId)) {
              matchStage.categoryId = new mongoose.Types.ObjectId(catId);
           }
        }
        break;

      case 'custom_query':
        // Fallthrough to filter application below
        break;
    }

    // 3. Apply Explicit Filters (Array of {field, operator, value})
    // This runs for ALL rule types (except manual potentially) to allow further refinement
    if (rule.ruleType !== 'manual_selection' && rule.filters && Array.isArray(rule.filters)) {
      rule.filters.forEach(filter => {
        this._applyFilter(matchStage, filter);
      });
    }

    // 4. Construct Final Pipeline
    const pipeline = [
      { $match: matchStage }
    ];

    return {
      pipeline,
      sort: sortStage,
      limit: Math.min(limit, 50)
    };
  }

  /**
   * Helper: Mutates the match object based on operators
   */
  _applyFilter(match, { field, operator, value, value2 }) {
    if (value === undefined || value === null || value === '') return;

    // Field Mapping
    const fieldMap = {
      'category': 'categoryId',
      'brand': 'brandId',
      'price': 'sellingPrice',
      'stock': 'inventory.quantity',
      'tags': 'tags'
    };
    
    const dbField = fieldMap[field] || field;

    switch (operator) {
      case 'equals': match[dbField] = value; break;
      case 'not_equals': match[dbField] = { $ne: value }; break;
      case 'contains': match[dbField] = { $regex: value, $options: 'i' }; break;
      case 'greater_than': match[dbField] = { $gt: Number(value) }; break;
      case 'less_than': match[dbField] = { $lt: Number(value) }; break;
      case 'between': match[dbField] = { $gte: Number(value), $lte: Number(value2) }; break;
      case 'in': match[dbField] = { $in: Array.isArray(value) ? value : [value] }; break;
    }
  }
}

<<<<<<< HEAD
module.exports = new RuleQueryBuilder();

// // src/services/storefront/ruleQueryBuilder.service.js

// const { SMART_RULE_TYPES } = require('../../utils/constants/sectionTypes.constants');
// const AppError = require('../../../core/utils/appError');

// class RuleQueryBuilder {
//   build(rule, organizationId) {
//     if (!rule || !organizationId) {
//       throw new AppError('Invalid rule or organization', 400);
//     }

//     const match = {
//       organizationId,
//       isActive: true
//     };

//     const pipeline = [];

//     switch (rule.ruleType) {
//       case SMART_RULE_TYPES.NEW_ARRIVALS:
//         this.newArrivals(match, rule);
//         break;

//       case SMART_RULE_TYPES.BEST_SELLERS:
//         this.bestSellers(match, rule);
//         break;

//       case SMART_RULE_TYPES.CLEARANCE_SALE:
//         pipeline.push(...this.clearanceSale());
//         break;

//       case SMART_RULE_TYPES.TRENDING:
//         this.trending(match);
//         break;

//       case SMART_RULE_TYPES.CATEGORY_BASED:
//         this.categoryBased(match, rule);
//         break;

//       case SMART_RULE_TYPES.LOW_STOCK:
//         this.lowStock(match, rule);
//         break;

//       case SMART_RULE_TYPES.PRICE_RANGE:
//         this.priceRange(match, rule);
//         break;

//       case SMART_RULE_TYPES.CUSTOM_QUERY:
//         this.applyFilters(match, rule.filters);
//         break;

//       default:
//         break;
//     }

//     this.applyFilters(match, rule.filters);

//     return {
//       pipeline: pipeline.length
//         ? [{ $match: match }, ...pipeline]
//         : [{ $match: match }],
//       sort: this.buildSort(rule),
//       limit: Math.min(rule.limit || 10, 50)
//     };
//   }

//   buildSort(rule) {
//     return {
//       [rule.sortBy || 'createdAt']: rule.sortOrder === 'asc' ? 1 : -1
//     };
//   }

//   newArrivals(match, rule) {
//     const days = this.getDays(rule.filters, 'createdAt') || 30;
//     const date = new Date();
//     date.setDate(date.getDate() - days);
//     match.createdAt = { $gte: date };
//   }

//   bestSellers(match, rule) {
//     const days = this.getDays(rule.filters, 'lastSold');
//     if (days) {
//       const date = new Date();
//       date.setDate(date.getDate() - days);
//       match.lastSold = { $gte: date };
//     }

//     // Ensure we are sorting by sales (requires salesCount in Schema as discussed before)
//     rule.sortBy = 'salesCount';
//     rule.sortOrder = 'desc';
//   }

//   // bestSellers(match, rule) {
//   //   const days = this.getDays(rule.filters, 'lastSold') || 90;
//   //   const date = new Date();
//   //   date.setDate(date.getDate() - days);
//   //   match.lastSold = { $gte: date };
//   // }

//   trending(match) {
//     const date = new Date();
//     date.setDate(date.getDate() - 7);
//     match.lastSold = { $gte: date };
//   }

//   categoryBased(match, rule) {
//     const category = this.getFilter(rule.filters, 'category');
//     if (!category) {
//       throw new AppError('Category filter required', 400);
//     }
//     match.category = category;
//   }

//   lowStock(match, rule) {
//     const threshold = this.getFilter(rule.filters, 'quantity') || 10;
//     match.inventory = {
//       $elemMatch: { quantity: { $lte: threshold } }
//     };
//   }

//   priceRange(match, rule) {
//     const min = this.getFilter(rule.filters, 'price_min') || 0;
//     const max = this.getFilter(rule.filters, 'price_max') || 999999;
//     match.sellingPrice = { $gte: min, $lte: max };
//   }

//   clearanceSale() {
//     return [
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
//       {
//         $match: { discountPercent: { $gte: 10 } }
//       },
//       {
//         $sort: { discountPercent: -1 }
//       }
//     ];
//   }

//   applyFilters(match, filters = []) {
//     filters.forEach(f => {
//       if (!f.field || !f.operator) return;

//       switch (f.operator) {
//         case 'equals':
//           match[f.field] = f.value;
//           break;
//         case 'greater_than':
//           match[f.field] = { $gt: f.value };
//           break;
//         case 'less_than':
//           match[f.field] = { $lt: f.value };
//           break;
//         case 'in':
//           match[f.field] = { $in: Array.isArray(f.value) ? f.value : [f.value] };
//           break;
//       }
//     });
//   }

//   getFilter(filters, field) {
//     return filters?.find(f => f.field === field)?.value;
//   }

//   getDays(filters, field) {
//     const val = this.getFilter(filters, field);
//     if (typeof val === 'string' && val.endsWith('d')) {
//       return parseInt(val);
//     }
//     return null;
//   }
// }

// module.exports = new RuleQueryBuilder();
=======
module.exports = new RuleQueryBuilder();
>>>>>>> f866ea5f98b08ee23003c9b4ccea5ff507d78be8
