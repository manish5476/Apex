// src/storefront/controllers/index.js
module.exports = {
  LayoutAdminController:      require('./layoutAdmin.controller'),
  StorefrontAdminController:  require('./storefrontAdmin.controller'),
  SmartRuleController:        require('./smartRule.controller'),
  StorefrontPublicController: require('./storefrontPublic.controller'),
  ProductPublicController:    require('./productPublic.controller'),
  CartController:             require('./cart.controller')
};