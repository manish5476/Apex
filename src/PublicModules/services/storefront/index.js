// src/storefront/services/index.js
module.exports = {
  LayoutService:        require('./layout.service'),
  SectionRegistry:      require('./sectionRegistry.service'),
  SmartRuleEngine:      require('./smartRuleEngine.service'),
  RuleQueryBuilder:     require('./ruleQueryBuilder.service'),
  DataHydrationService: require('./dataHydration.service'),
  CartService:          require('./cart.service'),
  StorefrontSessionService: require('./session.service'),
  StorefrontCustomerService: require('./customer.service'),
  StorefrontOrderService: require('./order.service'),
  // SectionValidator:     require('../middleware/section.validator'),
  // validateSmartRule:    require('./smartRule.validator').validateSmartRule
};
