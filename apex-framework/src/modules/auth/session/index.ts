const router = require('./api/routes/session.routes');
const sessionService = require('./application/services/session.service');
const { SESSION_EVENTS } = require('./events/session.events');

module.exports = {
  router,
  service: sessionService,
  events: SESSION_EVENTS,
};
