const mongoose = require('mongoose');
const AppError = require('../../../core/utils/appError');

class RuleQueryBuilder {

  /**
   * Main Entry Point
   * Builds a MongoDB Aggregation Pipeline from a Rule Configuration
   * @param {Object} rule - The SmartRule object or ad-hoc config
   * @param {String} organizationId 
   */
  build(rule, organizationId) {
    if (!rule || !organizationId) {
      throw new AppError('Invalid rule execution context', 400);
    }

    // 1. Base Match (Security: Always filter by Org & Active status)
    const matchStage = {
      organizationId: new mongoose.Types.ObjectId(organizationId),
      isActive: true,
      // Ensure we don't show deleted or archived products
      // Assuming 'status' or 'isDeleted' fields exist on Product model
      $or: [{ isDeleted: { $exists: false } }, { isDeleted: false }] 
    };

    let sortStage = { createdAt: -1 }; // Default Sort
    let limit = rule.limit || 12;      // Default Limit

    // 2. Apply Rule Strategy
    switch (rule.ruleType) {
      
      // --- MANUAL SELECTION ---
      case 'manual_selection':
        if (rule.manualProductIds && rule.manualProductIds.length > 0) {
          // Convert string IDs to ObjectIds
          const objectIds = rule.manualProductIds.map(id => new mongoose.Types.ObjectId(id));
          matchStage._id = { $in: objectIds };
          
          // CRITICAL: Preserve manual order if possible (Requires complex aggregation, skipping for MVP)
          // For MVP, we just return them. 
          // If strict order is needed, we would need to use $addFields with $indexOfArray in the pipeline.
          limit = rule.manualProductIds.length; // Override limit to show all selected
        } else {
          // Fallback: If manual type selected but no IDs provided, return nothing to prevent leaking random products
          matchStage._id = { $in: [] }; 
        }
        break;

      // --- SMART STRATEGIES ---
      case 'new_arrivals':
        sortStage = { createdAt: -1 };
        break;

      case 'best_sellers':
        // Sort by sales count (descending)
        // Ensure we only get items that have actually sold
        sortStage = { 'analytics.salesCount': -1, lastSold: -1 };
        matchStage['analytics.salesCount'] = { $gt: 0 };
        break;

      case 'trending':
        // Products viewed/sold recently (e.g., last 7 or 30 days)
        const trendingWindow = new Date();
        trendingWindow.setDate(trendingWindow.getDate() - 30); // 30 Day Window
        
        matchStage.$or = [
          { lastSold: { $gte: trendingWindow } },
          { updatedAt: { $gte: trendingWindow } } // Fallback for new items
        ];
        sortStage = { lastSold: -1, viewCount: -1 };
        break;

      case 'clearance_sale':
        // Products with a discount > 0
        // Logic: Discounted Price exists AND is less than Selling Price
        matchStage.discountedPrice = { $exists: true, $ne: null };
        matchStage.$expr = { $lt: ["$discountedPrice", "$sellingPrice"] };
        sortStage = { discountedPrice: 1 }; // Cheapest first? Or biggest discount? Let's go with Cheapest for now.
        break;

      case 'category_based':
        // Explicit Category ID check
        if (rule.categoryId) {
          matchStage.categoryId = new mongoose.Types.ObjectId(rule.categoryId);
        } else {
          // Fallback logic if they forgot to pick a category: Don't crash, just show recent
          // console.warn('Category rule missing category ID');
        }
        break;

      case 'custom_query':
        // Fallthrough to filter application below
        break;
    }

    // 3. Apply Explicit Filters (Array of {field, operator, value})
    // This runs for ALL rule types (except manual potentially) to allow further refinement
    // e.g. "New Arrivals" (Strategy) + "Price < 50" (Filter)
    if (rule.ruleType !== 'manual_selection' && rule.filters && Array.isArray(rule.filters)) {
      rule.filters.forEach(filter => {
        this._applyFilter(matchStage, filter);
      });
    }

    // 4. Construct Final Pipeline
    const pipeline = [
      { $match: matchStage }
    ];

    // OPTIONAL: If Manual Selection, we might want to preserve the order of IDs
    // This is an advanced aggregation pattern.
    if (rule.ruleType === 'manual_selection' && rule.manualProductIds?.length > 0) {
       // logic to preserve order could go here if needed later
    }

    return {
      pipeline,
      sort: sortStage,
      limit: Math.min(limit, 50) // Hard cap at 50 to prevent massive queries
    };
  }

  /**
   * Helper: Mutates the match object based on operators
   */
  _applyFilter(match, { field, operator, value, value2 }) {
    if (value === undefined || value === null || value === '') return;

    // Field Mapping (Frontend friendly names -> DB paths)
    const fieldMap = {
      'category': 'categoryId',
      'brand': 'brandId',
      'price': 'sellingPrice',
      'stock': 'inventory.quantity', // Requires deeper lookup usually, but simplified for root level if schema allows
      'tags': 'tags'
    };
    
    // Handle Special "Virtual" Fields if necessary
    const dbField = fieldMap[field] || field;

    switch (operator) {
      case 'equals': 
        match[dbField] = value; 
        break;
      case 'not_equals': 
        match[dbField] = { $ne: value }; 
        break;
      case 'contains': 
        match[dbField] = { $regex: value, $options: 'i' }; 
        break;
      case 'greater_than': 
        match[dbField] = { $gt: Number(value) }; 
        break;
      case 'less_than': 
        match[dbField] = { $lt: Number(value) }; 
        break;
      case 'between': 
        match[dbField] = { $gte: Number(value), $lte: Number(value2) }; 
        break;
      case 'in': 
        match[dbField] = { $in: Array.isArray(value) ? value : [value] }; 
        break;
    }
  }
}

module.exports = new RuleQueryBuilder();