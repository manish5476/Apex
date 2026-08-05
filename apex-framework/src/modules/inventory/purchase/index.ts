const router = require('./api/routes/purchase.routes');
const purchaseService = require('./application/services/purchase.service');
const { PURCHASE_EVENTS } = require('./events/purchase.events');

module.exports = {
  router,
  service: purchaseService,
  events: PURCHASE_EVENTS,
};
