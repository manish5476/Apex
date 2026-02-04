const AppError = require('../../../core/utils/appError');

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
  /**
   * Builds the Aggregation Pipeline for a Smart Rule
   * @param {Object} rule - The rule object (from DB or Ad-Hoc config)
   * @param {String} organizationId 
   */
  build(rule, organizationId) {
    if (!rule || !organizationId) {
      throw new AppError('Invalid rule or organization', 400);
    }

    const match = {
      organizationId,
      isActive: true
    };

    // PRO FEATURE: Exclude specific products (e.g. if they are manually pinned at the top)
    if (rule.excludedProductIds && rule.excludedProductIds.length > 0) {
      match._id = { $nin: rule.excludedProductIds };
    }

    const pipeline = [];

    switch (rule.ruleType) {
      case SMART_RULE_TYPES.NEW_ARRIVALS:
        this.newArrivals(match, rule);
        break;

      case SMART_RULE_TYPES.BEST_SELLERS:
        this.bestSellers(match, rule);
        break;

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
          }
        }
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

  getFilter(filters, field) {
    return filters?.find(f => f.field === field)?.value;
  }

  getDays(filters, field) {
    const val = this.getFilter(filters, field);
    if (typeof val === 'string' && val.endsWith('d')) {
      return parseInt(val);
    }
    return null;
  }
}

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
