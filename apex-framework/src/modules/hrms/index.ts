const express = require('express');
const router = express.Router();

/**
 * This is a NAMESPACE, not a module with its own model/service.
 * It only aggregates its sub-modules' routers below. Each one is a
 * fully independent module with its own model, repository, service,
 * events and cache — they do NOT import each other directly, only
 * communicate via the event bus.
 */
router.use('/attendance', require('./attendance').router);
router.use('/core-hr', require('./coreHr').router);
router.use('/leave-management', require('./leaveManagement').router);
router.use('/payroll-compensation', require('./payrollCompensation').router);
router.use('/performance', require('./performance').router);

module.exports = { router };
