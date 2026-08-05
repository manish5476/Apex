const router = require('./api/routes/counter.routes');
const counterService = require('./application/services/counter.service');
const { COUNTER_EVENTS } = require('./events/counter.events');

module.exports = {
  router,
  service: counterService,
  events: COUNTER_EVENTS,
};
