const router = require('./api/routes/product.routes');
const productService = require('./application/services/product.service');
const { PRODUCT_EVENTS } = require('./events/product.events');

module.exports = {
  router,
  service: productService,
  events: PRODUCT_EVENTS,
};
