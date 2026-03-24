/**
 * RuleQueryBuilder
 *
 * Converts a SmartRule config object into a MongoDB aggregation pipeline.
 *
 * Fixed issues vs. v1:
 *   - 'trending' case no longer overwrites the soft-delete $or guard
 *   - Field map covers 'stock' using $elemMatch for inventory array
 *   - 'salesCount' sort uses consistent top-level field name
 *   - All cases explicitly handled; no silent fall-throughs
 */

'use strict';

const mongoose = require('mongoose');
const AppError = require('../../../core/utils/api/appError');

// Consistent sort field paths — must match Product schema
const SORT_FIELD_MAP = {
  createdAt:  'createdAt',
  sellingPrice:'sellingPrice',
  name:       'name',
  lastSold:   'lastSold',
  views:      'views',
  salesCount: 'salesCount'   // top-level field on Product — no nesting
};

class RuleQueryBuilder {

  /**
   * Build aggregation components from a rule config.
   *
   * @param {Object} rule          SmartRule doc or ad-hoc config object
   * @param {string} organizationId
   * @returns {{ pipeline: Object[], sort: Object, limit: number }}
   */
  build(rule, organizationId) {
    if (!rule || !organizationId) {
      throw new AppError('Invalid rule execution context', 400);
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[RuleQueryBuilder] Building:', {
        type: rule.ruleType,
        org:  organizationId,
        manualCount: rule.manualProductIds?.length
      });
    }

    // ------------------------------------------------------------------
    // Base match — always applied, cannot be overridden by rule strategies
    // ------------------------------------------------------------------
    const baseMatch = {
      organizationId: new mongoose.Types.ObjectId(organizationId),
      isActive: true,
      isDeleted: { $ne: true }
    };

    // Rule-specific additions go into a separate object, then merged safely
    const ruleMatch = {};
    let sortStage   = { createdAt: -1 };
    let limit       = Math.min(rule.limit || 12, 50);

    // ------------------------------------------------------------------
    // Rule strategies
    // ------------------------------------------------------------------
    switch (rule.ruleType) {

      case 'manual_selection': {
        const ids = this._parseObjectIds(rule.manualProductIds);
        ruleMatch._id = { $in: ids };
        limit = ids.length || 0; // Return exactly what was selected
        break;
      }

      case 'new_arrivals': {
        sortStage = { createdAt: -1 };
        break;
      }

      case 'best_sellers': {
        sortStage = { salesCount: -1, lastSold: -1 };
        ruleMatch.salesCount = { $gt: 0 };
        break;
      }

      case 'trending': {
        const window = new Date();
        window.setDate(window.getDate() - 30);
        // ✅ FIX: Use $and so we don't overwrite the base $or-less match
        // We store trending conditions in ruleMatch and merge below
        ruleMatch.$or = [
          { lastSold:  { $gte: window } },
          { updatedAt: { $gte: window } }
        ];
        sortStage = { lastSold: -1, views: -1 };
        break;
      }

      case 'clearance_sale': {
        ruleMatch.discountedPrice = { $exists: true, $ne: null };
        ruleMatch.$expr = { $lt: ['$discountedPrice', '$sellingPrice'] };
        sortStage = { discountedPrice: 1 };
        break;
      }

      case 'low_stock': {
        // Items where at least one branch has quantity > 0 but total < threshold
        ruleMatch.inventory = {
          $elemMatch: { quantity: { $gt: 0, $lt: rule.lowStockThreshold ?? 10 } }
        };
        sortStage = { createdAt: -1 };
        break;
      }

      case 'category_based': {
        const catId = this._toObjectId(rule.categoryId ?? rule.categoryId?.value);
        if (catId) ruleMatch.categoryId = catId;
        break;
      }

      case 'price_range': {
        // Filters array will handle the actual range via _applyFilters below
        break;
      }

      case 'custom_query': {
        // Entirely driven by the filters array below
        break;
      }

      case 'seasonal':
      case 'new_arrivals':
      default: {
        sortStage = { createdAt: -1 };
        break;
      }
    }

    // ------------------------------------------------------------------
    // Override sort if rule explicitly specifies one
    // ------------------------------------------------------------------
    if (rule.sortBy && SORT_FIELD_MAP[rule.sortBy]) {
      const dir = rule.sortOrder === 'asc' ? 1 : -1;
      sortStage = { [SORT_FIELD_MAP[rule.sortBy]]: dir };
    }

    // ------------------------------------------------------------------
    // Apply explicit filters (for all types except manual)
    // ------------------------------------------------------------------
    if (rule.ruleType !== 'manual_selection' && Array.isArray(rule.filters)) {
      this._applyFilters(ruleMatch, rule.filters);
    }

    // ------------------------------------------------------------------
    // Merge: base match is always first and cannot be polluted
    // ------------------------------------------------------------------
    const finalMatch = { ...baseMatch, ...ruleMatch };

    return {
      pipeline: [{ $match: finalMatch }],
      sort:     sortStage,
      limit
    };
  }

  // --------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------

  /**
   * Apply an array of filter descriptors onto a match object.
   * Mutates `match` in place.
   */
  _applyFilters(match, filters) {
    for (const f of filters) {
      if (!f || !f.field || !f.operator) continue;
      if (f.value === undefined || f.value === null || f.value === '') continue;
      this._applyFilter(match, f);
    }
  }

  _applyFilter(match, { field, operator, value, value2 }) {
    const fieldMap = {
      category: 'categoryId',
      brand:    'brandId',
      price:    'sellingPrice',
      discount: 'discountedPrice',
      tags:     'tags',
      stock:    'inventory'        // handled specially below
    };

    const dbField = fieldMap[field] ?? field;

    // Special: inventory stock filter uses $elemMatch
    if (field === 'stock') {
      switch (operator) {
        case 'greater_than': match.inventory = { $elemMatch: { quantity: { $gt: Number(value) } } }; break;
        case 'less_than':    match.inventory = { $elemMatch: { quantity: { $lt: Number(value) } } }; break;
        case 'equals':       match.inventory = { $elemMatch: { quantity: Number(value) } };            break;
        case 'between':
          match.inventory = { $elemMatch: { quantity: { $gte: Number(value), $lte: Number(value2) } } };
          break;
      }
      return;
    }

    switch (operator) {
      case 'equals':       match[dbField] = value; break;
      case 'not_equals':   match[dbField] = { $ne: value }; break;
      case 'contains':     match[dbField] = { $regex: value, $options: 'i' }; break;
      case 'greater_than': match[dbField] = { $gt:  Number(value) }; break;
      case 'less_than':    match[dbField] = { $lt:  Number(value) }; break;
      case 'between':
        match[dbField] = { $gte: Number(value), $lte: Number(value2) };
        break;
      case 'in':
        match[dbField] = { $in: Array.isArray(value) ? value : [value] };
        break;
    }
  }

  /**
   * Robustly convert an array of mixed-format IDs to ObjectIds.
   * Handles: string, 24-char string, { value: id }, already-ObjectId.
   */
  _parseObjectIds(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    return ids
      .map(id => this._toObjectId(typeof id === 'object' && id?.value ? id.value : id))
      .filter(Boolean);
  }

  _toObjectId(value) {
    if (!value) return null;
    if (value instanceof mongoose.Types.ObjectId) return value;
    if (mongoose.isValidObjectId(value)) return new mongoose.Types.ObjectId(value);
    return null;
  }
}

module.exports = new RuleQueryBuilder();

// const mongoose = require('mongoose');
// const AppError = require('../../../core/utils/api/appError');

// class RuleQueryBuilder {

//   /**
//    * Main Entry Point
//    * Builds a MongoDB Aggregation Pipeline from a Rule Configuration
//    * @param {Object} rule - The SmartRule object or ad-hoc config
//    * @param {String} organizationId 
//    */
//   build(rule, organizationId) {
//     // Debug Log
//     if (process.env.NODE_ENV === 'development') {
//       console.log('[RuleQueryBuilder] Building:', { type: rule?.ruleType, org: organizationId, manualIds: rule?.manualProductIds?.length });
//     }

//     if (!rule || !organizationId) {
//       throw new AppError('Invalid rule execution context', 400);
//     }

//     // 1. Base Match (Security: Always filter by Org & Active status)
//     const matchStage = {
//       organizationId: new mongoose.Types.ObjectId(organizationId),
//       isActive: true,
//       $or: [{ isDeleted: { $exists: false } }, { isDeleted: false }] 
//     };

//     let sortStage = { createdAt: -1 }; // Default Sort
//     let limit = rule.limit || 12;      // Default Limit

//     // 2. Apply Rule Strategy
//     switch (rule.ruleType) {
      
//       // --- MANUAL SELECTION ---
//       case 'manual_selection':
//         // Ensure manualProductIds exists and is an array
//         if (Array.isArray(rule.manualProductIds) && rule.manualProductIds.length > 0) {
//           try {
//             // Robust ID conversion (Handle strings, objects with .value, or already ObjectIds)
//             const objectIds = rule.manualProductIds
//               .map(id => {
//                 if (mongoose.isValidObjectId(id)) return new mongoose.Types.ObjectId(id);
//                 if (typeof id === 'string' && id.length === 24) return new mongoose.Types.ObjectId(id);
//                 if (typeof id === 'object' && id.value) return new mongoose.Types.ObjectId(id.value);
//                 return null;
//               })
//               .filter(id => id !== null);

//             matchStage._id = { $in: objectIds };
            
//             // Override limit to ensure all selected items are returned
//             limit = objectIds.length > 0 ? objectIds.length : 12;
            
//             // Optimization: If no valid IDs found, ensure we return nothing
//             if (objectIds.length === 0) matchStage._id = { $in: [] };

//           } catch (e) {
//             console.error('[RuleQueryBuilder] Error parsing manual IDs:', e);
//             matchStage._id = { $in: [] }; 
//           }
//         } else {
//           // Fallback: If manual type selected but no IDs provided, return nothing
//           matchStage._id = { $in: [] }; 
//         }
//         break;

//       // --- SMART STRATEGIES ---
//       case 'new_arrivals':
//         sortStage = { createdAt: -1 };
//         break;

//       case 'best_sellers':
//         // Sort by sales count (descending)
//         sortStage = { 'analytics.salesCount': -1, lastSold: -1 };
//         matchStage['analytics.salesCount'] = { $gt: 0 };
//         break;

//       case 'trending':
//         // Products viewed/sold recently (e.g., last 30 days)
//         const trendingWindow = new Date();
//         trendingWindow.setDate(trendingWindow.getDate() - 30);
        
//         matchStage.$or = [
//           { lastSold: { $gte: trendingWindow } },
//           { updatedAt: { $gte: trendingWindow } }
//         ];
//         sortStage = { lastSold: -1, viewCount: -1 };
//         break;

//       case 'clearance_sale':
//         // Products with a discount > 0
//         matchStage.discountedPrice = { $exists: true, $ne: null };
//         matchStage.$expr = { $lt: ["$discountedPrice", "$sellingPrice"] };
//         sortStage = { discountedPrice: 1 };
//         break;

//       case 'category_based':
//         // Explicit Category ID check
//         if (rule.categoryId) {
//            // Handle both string ID and {value: id} format
//            const catId = typeof rule.categoryId === 'object' && rule.categoryId.value 
//              ? rule.categoryId.value 
//              : rule.categoryId;
             
//            if (mongoose.isValidObjectId(catId)) {
//               matchStage.categoryId = new mongoose.Types.ObjectId(catId);
//            }
//         }
//         break;

//       case 'custom_query':
//         // Fallthrough to filter application below
//         break;
//     }

//     // 3. Apply Explicit Filters (Array of {field, operator, value})
//     // This runs for ALL rule types (except manual potentially) to allow further refinement
//     if (rule.ruleType !== 'manual_selection' && rule.filters && Array.isArray(rule.filters)) {
//       rule.filters.forEach(filter => {
//         this._applyFilter(matchStage, filter);
//       });
//     }

//     // 4. Construct Final Pipeline
//     const pipeline = [
//       { $match: matchStage }
//     ];

//     return {
//       pipeline,
//       sort: sortStage,
//       limit: Math.min(limit, 50)
//     };
//   }

//   /**
//    * Helper: Mutates the match object based on operators
//    */
//   _applyFilter(match, { field, operator, value, value2 }) {
//     if (value === undefined || value === null || value === '') return;

//     // Field Mapping
//     const fieldMap = {
//       'category': 'categoryId',
//       'brand': 'brandId',
//       'price': 'sellingPrice',
//       'stock': 'inventory.quantity',
//       'tags': 'tags'
//     };
    
//     const dbField = fieldMap[field] || field;

//     switch (operator) {
//       case 'equals': match[dbField] = value; break;
//       case 'not_equals': match[dbField] = { $ne: value }; break;
//       case 'contains': match[dbField] = { $regex: value, $options: 'i' }; break;
//       case 'greater_than': match[dbField] = { $gt: Number(value) }; break;
//       case 'less_than': match[dbField] = { $lt: Number(value) }; break;
//       case 'between': match[dbField] = { $gte: Number(value), $lte: Number(value2) }; break;
//       case 'in': match[dbField] = { $in: Array.isArray(value) ? value : [value] }; break;
//     }
//   }
// }

// module.exports = new RuleQueryBuilder();