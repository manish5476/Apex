const router = require('./api/routes/sales.routes');
const salesService = require('./application/services/sales.service');
const { SALES_EVENTS } = require('./events/sales.events');

module.exports = {
  router,
  service: salesService,
  events: SALES_EVENTS,
};
