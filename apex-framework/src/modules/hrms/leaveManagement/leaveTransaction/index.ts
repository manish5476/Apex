const router = require('./api/routes/leaveTransaction.routes');
const leaveTransactionService = require('./application/services/leaveTransaction.service');
const { LEAVE_TRANSACTION_EVENTS } = require('./events/leaveTransaction.events');

module.exports = {
  router,
  service: leaveTransactionService,
  events: LEAVE_TRANSACTION_EVENTS,
};
