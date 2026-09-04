const router = require('./api/routes/expenseClaim.routes');
const expenseClaimService = require('./application/services/expenseClaim.service');
const { EXPENSE_CLAIM_EVENTS } = require('./events/expenseClaim.events');

module.exports = {
  router,
  service: expenseClaimService,
  events: EXPENSE_CLAIM_EVENTS,
};
