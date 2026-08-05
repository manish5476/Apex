const router = require('./api/routes/shipment.routes');
const shipmentService = require('./application/services/shipment.service');
const { SHIPMENT_EVENTS } = require('./events/shipment.events');

module.exports = {
  router,
  service: shipmentService,
  events: SHIPMENT_EVENTS,
};
