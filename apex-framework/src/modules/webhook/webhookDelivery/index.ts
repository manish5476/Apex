const router = require('./api/routes/webhookDelivery.routes');
const webhookDeliveryService = require('./application/services/webhookDelivery.service');
const { WEBHOOK_DELIVERY_EVENTS } = require('./events/webhookDelivery.events');

module.exports = {
  router,
  service: webhookDeliveryService,
  events: WEBHOOK_DELIVERY_EVENTS,
};
