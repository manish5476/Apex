const router = require('./api/routes/storefrontCartItem.routes');
const storefrontCartItemService = require('./application/services/storefrontCartItem.service');
const { STOREFRONT_CART_ITEM_EVENTS } = require('./events/storefrontCartItem.events');

module.exports = {
  router,
  service: storefrontCartItemService,
  events: STOREFRONT_CART_ITEM_EVENTS,
};
