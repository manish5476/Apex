/**
 * Public interface of the "products" module.
 *
 * RULE: nothing outside this folder should ever do
 *   require('../products/application/services/product.service')
 * Only require('../products') is allowed. Everything internal can be
 * refactored freely as long as this file's exports stay stable.
 *
 * This is what makes extraction into a real microservice painless later:
 * the "contract" other modules depend on is already explicit and narrow.
 */
const router = require('./api/routes/product.routes');
const productService = require('./application/services/product.service');
const { PRODUCT_EVENTS } = require('./events/product.events');

module.exports = {
  router,          // mounted by gateway/routes.js
  service: productService, // only expose if another module genuinely needs
                            // direct calls (rare — prefer events)
  events: PRODUCT_EVENTS,  // so other modules know what to subscribe to
};
