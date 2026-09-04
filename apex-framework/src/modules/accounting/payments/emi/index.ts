const router = require('./api/routes/emi.routes');
const emiService = require('./application/services/emi.service');
const { EMI_EVENTS } = require('./events/emi.events');

module.exports = {
  router,
  service: emiService,
  events: EMI_EVENTS,
};
