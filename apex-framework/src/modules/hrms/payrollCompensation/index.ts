const express = require('express');
const router = express.Router();

/**
 * This is a NAMESPACE, not a module with its own model/service.
 * It only aggregates its sub-modules' routers below. Each one is a
 * fully independent module with its own model, repository, service,
 * events and cache — they do NOT import each other directly, only
 * communicate via the event bus.
 */
router.use('/expense-claim', require('./expenseClaim').router);
router.use('/payslip', require('./payslip').router);
router.use('/salary-structure', require('./salaryStructure').router);
router.use('/tax-deduction', require('./taxDeduction').router);

module.exports = { router };
