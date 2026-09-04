const router = require('./api/routes/dashboard.routes');
const dashboardService = require('./application/services/dashboard.service');
const { DASHBOARD_EVENTS } = require('./events/dashboard.events');

module.exports = {
  router,
  service: dashboardService,
  events: DASHBOARD_EVENTS,
};
