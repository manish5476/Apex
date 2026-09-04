const router = require('./api/routes/storefrontWishlist.routes');
const storefrontWishlistService = require('./application/services/storefrontWishlist.service');
const { STOREFRONT_WISHLIST_EVENTS } = require('./events/storefrontWishlist.events');

module.exports = {
  router,
  service: storefrontWishlistService,
  events: STOREFRONT_WISHLIST_EVENTS,
};
