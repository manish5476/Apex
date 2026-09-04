const router = require('./api/routes/payslip.routes');
const payslipService = require('./application/services/payslip.service');
const { PAYSLIP_EVENTS } = require('./events/payslip.events');

module.exports = {
  router,
  service: payslipService,
  events: PAYSLIP_EVENTS,
};
