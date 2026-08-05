const router = require('./api/routes/analytics.routes');
const analyticsService = require('./application/services/analytics.service');
const { ANALYTICS_EVENTS } = require('./events/analytics.events');

module.exports = {
  router,
  service: analyticsService,
  events: ANALYTICS_EVENTS,
};
