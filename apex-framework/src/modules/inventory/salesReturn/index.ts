const router = require('./api/routes/salesReturn.routes');
const salesReturnService = require('./application/services/salesReturn.service');
const { SALES_RETURN_EVENTS } = require('./events/salesReturn.events');

module.exports = {
  router,
  service: salesReturnService,
  events: SALES_RETURN_EVENTS,
};
