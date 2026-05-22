// src/storefront/models/index.js
module.exports = {
  StorefrontPage:         require('./storefrontPage.model'),
  StorefrontPageSnapshot: require('./storefrontPageSnapshot.model'),
  StorefrontLayout:       require('./storefrontLayout.model'),
  StorefrontCustomer:     require('./storefrontCustomer.model'),
  StorefrontCustomerAddress: require('./storefrontCustomerAddress.model'),
  StorefrontSession:      require('./storefrontSession.model'),
  StorefrontCart:         require('./storefrontCart.model'),
  StorefrontCartItem:     require('./storefrontCartItem.model'),
  StorefrontWishlist:     require('./storefrontWishlist.model'),
  StorefrontOrder:        require('./storefrontOrder.model'),
  SmartRule:              require('./smartRule.model'),
  SectionTemplate:        require('./sectionTemplate.model')
};
