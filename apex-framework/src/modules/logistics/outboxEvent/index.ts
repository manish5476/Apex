const router = require('./api/routes/outboxEvent.routes');
const outboxEventService = require('./application/services/outboxEvent.service');
const { OUTBOX_EVENT_EVENTS } = require('./events/outboxEvent.events');

module.exports = {
  router,
  service: outboxEventService,
  events: OUTBOX_EVENT_EVENTS,
};
