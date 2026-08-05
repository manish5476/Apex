const express = require('express');
const router = express.Router();

/**
 * This is a NAMESPACE, not a module with its own model/service.
 * It only aggregates its sub-modules' routers below. Each one is a
 * fully independent module with its own model, repository, service,
 * events and cache — they do NOT import each other directly, only
 * communicate via the event bus.
 */
router.use('/account', require('./account').router);
router.use('/account-entry', require('./accountEntry').router);
router.use('/pending-reconciliation', require('./pendingReconciliation').router);

module.exports = { router };
