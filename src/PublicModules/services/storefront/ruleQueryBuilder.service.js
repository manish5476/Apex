const mongoose = require('mongoose');
const AppError = require('../../../core/utils/api/appError');

class RuleQueryBuilder {

  /**
   * Main Entry Point
   * Builds a MongoDB Aggregation Pipeline from a Rule Configuration
   * @param {Object} rule - The SmartRule object or ad-hoc config
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

    let sortStage = { createdAt: -1 }; // Default Sort
    let limit = rule.limit || 12;      // Default Limit

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

          } catch (e) {
            console.error('[RuleQueryBuilder] Error parsing manual IDs:', e);
            matchStage._id = { $in: [] }; 
          }
        } else {
          // Fallback: If manual type selected but no IDs provided, return nothing
          matchStage._id = { $in: [] }; 
        }
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

module.exports = new RuleQueryBuilder();