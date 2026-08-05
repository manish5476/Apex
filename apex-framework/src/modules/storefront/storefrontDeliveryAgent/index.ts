const router = require('./api/routes/storefrontDeliveryAgent.routes');
const storefrontDeliveryAgentService = require('./application/services/storefrontDeliveryAgent.service');
const { STOREFRONT_DELIVERY_AGENT_EVENTS } = require('./events/storefrontDeliveryAgent.events');

module.exports = {
  router,
  service: storefrontDeliveryAgentService,
  events: STOREFRONT_DELIVERY_AGENT_EVENTS,
};
