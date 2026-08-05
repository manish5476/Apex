const router = require('./api/routes/webhookCore.routes');
const webhookCoreService = require('./application/services/webhookCore.service');
const { WEBHOOK_CORE_EVENTS } = require('./events/webhookCore.events');

module.exports = {
  router,
  service: webhookCoreService,
  events: WEBHOOK_CORE_EVENTS,
};
