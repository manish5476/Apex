const router = require('./api/routes/storefrontCart.routes');
const storefrontCartService = require('./application/services/storefrontCart.service');
const { STOREFRONT_CART_EVENTS } = require('./events/storefrontCart.events');

module.exports = {
  router,
  service: storefrontCartService,
  events: STOREFRONT_CART_EVENTS,
};
