const router = require('./api/routes/storefrontOrder.routes');
const storefrontOrderService = require('./application/services/storefrontOrder.service');
const { STOREFRONT_ORDER_EVENTS } = require('./events/storefrontOrder.events');

module.exports = {
  router,
  service: storefrontOrderService,
  events: STOREFRONT_ORDER_EVENTS,
};
