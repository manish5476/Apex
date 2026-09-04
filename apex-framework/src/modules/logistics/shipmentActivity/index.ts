const router = require('./api/routes/shipmentActivity.routes');
const shipmentActivityService = require('./application/services/shipmentActivity.service');
const { SHIPMENT_ACTIVITY_EVENTS } = require('./events/shipmentActivity.events');

module.exports = {
  router,
  service: shipmentActivityService,
  events: SHIPMENT_ACTIVITY_EVENTS,
};
