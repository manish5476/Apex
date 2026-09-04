const router = require('./api/routes/shipmentAssignment.routes');
const shipmentAssignmentService = require('./application/services/shipmentAssignment.service');
const { SHIPMENT_ASSIGNMENT_EVENTS } = require('./events/shipmentAssignment.events');

module.exports = {
  router,
  service: shipmentAssignmentService,
  events: SHIPMENT_ASSIGNMENT_EVENTS,
};
