const BaseResolver = require('./base.resolver');
const Product = require('../../../../modules/inventory/core/product.model');
const SmartRuleEngine = require('../smartRuleEngine.service');

class ProductResolver extends BaseResolver {
  async resolve(section, organizationId) {
    const config = section.config || {};
    
    // CASE 1: MANUAL SELECTION (User picked 5 specific products)
    if (section.dataSource === 'manual' && section.manualData?.productIds?.length) {
      return this.fetchManualProducts(section.manualData.productIds, organizationId);
    }

    // CASE 2: SMART RULES (Best Sellers, New Arrivals, etc.)
    if (section.dataSource === 'smart') {
      
      // A. If linked to a saved Smart Rule ID
      if (section.smartRuleId) {
        return SmartRuleEngine.executeRule(section.smartRuleId, organizationId);
      }

      // B. Ad-Hoc Configuration (Configured directly in UI without a saved Rule)
      if (config.ruleType) {
        return SmartRuleEngine.executeAdHocRule(config, organizationId);
      }
      
      // C. Simple Fallback (e.g., just show latest)
      return this.fetchLatestProducts(organizationId, config.limit || 8);
    }

    return [];
  }

  async fetchManualProducts(ids, organizationId) {
    const products = await Product.find({
      _id: { $in: ids },
      organizationId,
      isActive: true
    }).lean();
    
    // Use the Engine's transform method for consistency
    return SmartRuleEngine.transform(products);
  }

  async fetchLatestProducts(organizationId, limit) {
    const products = await Product.find({ organizationId, isActive: true })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return SmartRuleEngine.transform(products);
  }
}

module.exports = new ProductResolver();