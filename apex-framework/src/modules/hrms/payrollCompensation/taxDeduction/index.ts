const router = require('./api/routes/taxDeduction.routes');
const taxDeductionService = require('./application/services/taxDeduction.service');
const { TAX_DEDUCTION_EVENTS } = require('./events/taxDeduction.events');

module.exports = {
  router,
  service: taxDeductionService,
  events: TAX_DEDUCTION_EVENTS,
};
