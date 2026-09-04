const router = require('./api/routes/purchaseReturn.routes');
const purchaseReturnService = require('./application/services/purchaseReturn.service');
const { PURCHASE_RETURN_EVENTS } = require('./events/purchaseReturn.events');

module.exports = {
  router,
  service: purchaseReturnService,
  events: PURCHASE_RETURN_EVENTS,
};
