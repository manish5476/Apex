const mongoose = require('mongoose');
const { SMART_RULE_TYPES } = require('../../utils/constants/sectionTypes.constants');
const AppError = require('../../../core/utils/appError');

class RuleQueryBuilder {
  
  build(rule, organizationId) {
    if (!rule || !organizationId) { 
      throw new AppError('Invalid rule or organization', 400); 
    }

    // 1. Base Match
    const match = { 
      organizationId: mongoose.Types.ObjectId(organizationId), 
      isActive: true 
    };
    
    const pipeline = [];

    // 2. Switch Logic (Now includes Dead Stock & Heavy Discount)
    switch (rule.ruleType) {
      case SMART_RULE_TYPES.NEW_ARRIVALS:
        this.newArrivals(match, rule);
        break;
      
      case SMART_RULE_TYPES.BEST_SELLERS:
        this.bestSellers(match, rule);
        break;
      
      case SMART_RULE_TYPES.CLEARANCE_SALE:
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

      // ✅ NEW: Dead Stock Logic
      case 'dead_stock': // Ensure this key matches your constants
        this.deadStock(match, rule);
        break;

      // ✅ NEW: Heavy Discount Logic
      case 'heavy_discount':
        // heavyDiscount returns a pipeline stage because it needs $expr
        const discountStage = this.heavyDiscount(match, rule);
        if (discountStage) pipeline.push(discountStage);
        break;
      
      case SMART_RULE_TYPES.CUSTOM_QUERY:
        this.applyFilters(match, rule.filters);
        break;
      
      default:
        break;
    }

    // 3. Apply Generic Filters (Tags, Brand, etc.)
    this.applyFilters(match, rule.filters);

    // 4. Return Pipeline
    return {
      pipeline: pipeline.length
        ? [{ $match: match }, ...pipeline]
        : [{ $match: match }],
      sort: this.buildSort(rule),
      limit: Math.min(rule.limit || 10, 50)
    };
  }

  buildSort(rule) {
    // Default sort handling
    const sortField = rule.sortBy || 'createdAt';
    const sortDir = rule.sortOrder === 'asc' ? 1 : -1;
    return { [sortField]: sortDir };
  }

  // --- LOGIC HANDLERS ---

  newArrivals(match, rule) {
    const days = this.getDays(rule.filters, 'createdAt') || 30;
    const date = new Date();
    date.setDate(date.getDate() - days);
    match.createdAt = { $gte: date };
    
    // Default sort for new arrivals
    if (!rule.sortBy) rule.sortBy = 'createdAt';
    if (!rule.sortOrder) rule.sortOrder = 'desc';
  }

  bestSellers(match, rule) {
    const days = this.getDays(rule.filters, 'lastSold');
    if (days) {
      const date = new Date();
      date.setDate(date.getDate() - days);
      match.lastSold = { $gte: date };
    }
    // Force sort
    rule.sortBy = 'salesCount'; // Ensure your Product model has this or you use aggregation to count
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
      // It's possible the rule is malformed, or user hasn't selected one yet
      return; 
    }
    // ✅ FIX: Use 'categoryId' for relational lookup, not 'category' string
    // Assumes rule.filters stores the ObjectId as value
    match.categoryId = mongoose.Types.ObjectId(category);
  }

  lowStock(match, rule) {
    const threshold = this.getFilter(rule.filters, 'quantity') || 10;
    match.inventory = {
      $elemMatch: { quantity: { $lte: threshold } }
    };
  }

  priceRange(match, rule) {
    const min = this.getFilter(rule.filters, 'price_min') || 0;
    const max = this.getFilter(rule.filters, 'price_max') || 999999;
    match.sellingPrice = { $gte: min, $lte: max };
  }

  /**
   * ✅ NEW: Dead Stock
   * Strategy: Items with stock > 5 that haven't sold in 90 days (or ever)
   */
  deadStock(match, rule) {
    const days = this.getDays(rule.filters, 'dormantDays') || 90;
    const date = new Date();
    date.setDate(date.getDate() - days);

    match.inventory = { $elemMatch: { quantity: { $gt: 5 } } }; // Has stock
    match.$or = [
      { lastSold: { $exists: false } }, // Never sold
      { lastSold: { $lt: date } }       // Sold long ago
    ];
    
    // Sort by oldest first to clear old inventory
    rule.sortBy = 'createdAt';
    rule.sortOrder = 'asc';
  }

  /**
   * ✅ NEW: Heavy Discount
   * Strategy: Calculates percentage dynamically using $expr
   */
  heavyDiscount(match, rule) {
    // 1. Basic check
    match.discountedPrice = { $exists: true, $ne: null };

    // 2. Check for Min % Filter
    const minDiscount = this.getFilter(rule.filters, 'minDiscount');
    const minPct = minDiscount ? parseInt(minDiscount) : 0;

    if (minPct > 0) {
      const factor = 1 - (minPct / 100);
      
      // We return a pipeline stage because we need $expr logic which is cleaner in a separate $match stage
      // or we can attach it to the main match if we are careful. 
      // Returning a stage is safer for complex expressions.
      return {
        $match: {
          $expr: {
            $lte: ["$discountedPrice", { $multiply: ["$sellingPrice", factor] }]
          }
        }
      };
    }
    
    // Default sort: Biggest savings? Or just newest?
    if (!rule.sortBy) {
        rule.sortBy = 'discountedPrice';
        rule.sortOrder = 'asc';
    }
    return null;
  }

  clearanceSale() {
    // This is a legacy complex aggregation that calculates discount % in projection
    // You might prefer 'heavyDiscount' logic above for simpler queries, 
    // but we keep this for backward compatibility.
    return [
      {
        $addFields: {
          discountPercent: {
            $multiply: [
              {
                $divide: [
                  { $subtract: ['$sellingPrice', '$discountedPrice'] },
                  '$sellingPrice'
                ]
              },
              100
            ]
          }
        }
      },
      {
        $match: { discountPercent: { $gte: 10 } }
      },
      {
        $sort: { discountPercent: -1 }
      }
    ];
  }

  // --- UTILS ---

  applyFilters(match, filters = []) {
    if (!filters) return;
    
    filters.forEach(f => {
      if (!f.field || !f.operator) return;

      // Handle special fields handled by dedicated methods (skip them here)
      if (['category', 'price_min', 'price_max', 'minDiscount', 'dormantDays'].includes(f.field)) return;

      switch (f.operator) {
        case 'equals':
          match[f.field] = f.value;
          break;
        case 'not_equals':
          match[f.field] = { $ne: f.value };
          break;
        case 'greater_than':
          match[f.field] = { $gt: f.value };
          break;
        case 'less_than':
          match[f.field] = { $lt: f.value };
          break;
        case 'contains':
           match[f.field] = { $regex: f.value, $options: 'i' };
           break;
        case 'in':
          match[f.field] = { $in: Array.isArray(f.value) ? f.value : [f.value] };
          break;
        // ✅ NEW: Handle ID matching for Brands/Categories if passed generically
        case 'id_equals':
           match[f.field] = mongoose.Types.ObjectId(f.value);
           break;
      }
    });
  }

  getFilter(filters, field) {
    return filters?.find(f => f.field === field)?.value;
  }

  getDays(filters, field) {
    const val = this.getFilter(filters, field);
    if (!val) return null;
    // Handle "30d" string or raw number
    if (typeof val === 'string' && val.endsWith('d')) {
      return parseInt(val);
    }
    return parseInt(val);
  }
}

module.exports = new RuleQueryBuilder();

// // src/services/storefront/ruleQueryBuilder.service.js

// const { SMART_RULE_TYPES } = require('../../utils/constants/sectionTypes.constants');
// const AppError = require('../../../core/utils/appError');

// class RuleQueryBuilder {
//   build(rule, organizationId) {
//     if (!rule || !organizationId) { throw new AppError('Invalid rule or organization', 400); }
//     const match = { organizationId, isActive: true };
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
//     rule.sortBy = 'salesCount';
//     rule.sortOrder = 'desc';
//   }
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
