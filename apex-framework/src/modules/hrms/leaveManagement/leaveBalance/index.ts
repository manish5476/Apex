const router = require('./api/routes/leaveBalance.routes');
const leaveBalanceService = require('./application/services/leaveBalance.service');
const { LEAVE_BALANCE_EVENTS } = require('./events/leaveBalance.events');

module.exports = {
  router,
  service: leaveBalanceService,
  events: LEAVE_BALANCE_EVENTS,
};
