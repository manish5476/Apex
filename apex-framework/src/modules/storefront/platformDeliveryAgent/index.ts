const router = require('./api/routes/platformDeliveryAgent.routes');
const platformDeliveryAgentService = require('./application/services/platformDeliveryAgent.service');
const { PLATFORM_DELIVERY_AGENT_EVENTS } = require('./events/platformDeliveryAgent.events');

module.exports = {
  router,
  service: platformDeliveryAgentService,
  events: PLATFORM_DELIVERY_AGENT_EVENTS,
};
