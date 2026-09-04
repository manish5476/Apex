const express = require('express');
const router = express.Router();

/**
 * This is a NAMESPACE, not a module with its own model/service.
 * It only aggregates its sub-modules' routers below. Each one is a
 * fully independent module with its own model, repository, service,
 * events and cache — they do NOT import each other directly, only
 * communicate via the event bus.
 */
router.use('/attendance-daily', require('./attendanceDaily').router);
router.use('/attendance-log', require('./attendanceLog').router);
router.use('/attendance-machine', require('./attendanceMachine').router);
router.use('/attendance-request', require('./attendanceRequest').router);
router.use('/attendance-summary', require('./attendanceSummary').router);
router.use('/geo-fencing', require('./geoFencing').router);
router.use('/shift', require('./shift').router);
router.use('/shift-assignment', require('./shiftAssignment').router);
router.use('/shift-group', require('./shiftGroup').router);

module.exports = { router };
