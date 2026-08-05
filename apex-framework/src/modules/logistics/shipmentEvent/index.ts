const router = require('./api/routes/shipmentEvent.routes');
const shipmentEventService = require('./application/services/shipmentEvent.service');
const { SHIPMENT_EVENT_EVENTS } = require('./events/shipmentEvent.events');

module.exports = {
  router,
  service: shipmentEventService,
  events: SHIPMENT_EVENT_EVENTS,
};
