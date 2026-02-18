// routes/attendance/attendanceMachine.routes.js
const express = require('express');
const router = express.Router();
const attendanceMachineController = require('../../controllers/attendance/attendanceMachine.controller');
const { protect, restrictTo, machineAuth } = require('../../middleware/auth');
const { validateMachine } = require('../../middleware/validators');

// Machine routes (API key based)
router.post('/:id/ping', machineAuth, attendanceMachineController.machinePing);
router.post('/:id/sync', machineAuth, attendanceMachineController.syncMachine);

// All other routes require user authentication
router.use(protect);

// User mapping routes
router.get('/unmapped-users', restrictTo('admin'), attendanceMachineController.getUnmappedUsers);
router.post('/map-user', restrictTo('admin'), attendanceMachineController.mapUserToMachine);
router.post('/bulk-map', restrictTo('admin'), attendanceMachineController.bulkMapUsers);

// Analytics
router.get('/analytics', restrictTo('admin'), attendanceMachineController.getMachineAnalytics);

// Machine status & operations
router.get('/:id/status', restrictTo('admin', 'hr'), attendanceMachineController.getMachineStatus);
router.get('/:id/logs', restrictTo('admin', 'hr'), attendanceMachineController.getMachineLogs);
router.post('/:id/test-connection', restrictTo('admin'), attendanceMachineController.testConnection);
router.post('/:id/regenerate-key', restrictTo('admin'), attendanceMachineController.regenerateApiKey);

// Bulk operations
router.post('/bulk-status', restrictTo('admin'), attendanceMachineController.bulkUpdateStatus);

// Standard CRUD
router.route('/')
  .get(attendanceMachineController.getAllMachines)
  .post(
    restrictTo('admin'),
    validateMachine,
    attendanceMachineController.createMachine
  );

router.route('/:id')
  .get(attendanceMachineController.getMachine)
  .patch(
    restrictTo('admin'),
    validateMachine,
    attendanceMachineController.updateMachine
  )
  .delete(restrictTo('admin'), attendanceMachineController.deleteMachine);

module.exports = router;