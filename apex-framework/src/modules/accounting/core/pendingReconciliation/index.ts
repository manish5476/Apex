const router = require('./api/routes/pendingReconciliation.routes');
const pendingReconciliationService = require('./application/services/pendingReconciliation.service');
const { PENDING_RECONCILIATION_EVENTS } = require('./events/pendingReconciliation.events');

module.exports = {
  router,
  service: pendingReconciliationService,
  events: PENDING_RECONCILIATION_EVENTS,
};
