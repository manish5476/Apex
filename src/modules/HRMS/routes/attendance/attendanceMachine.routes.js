// routes/attendance/attendanceMachine.routes.js
const express = require('express');
const router = express.Router();
const attendanceMachineController = require('../../controllers/attendance/attendanceMachine.controller');
const { machineAuth } = require('../../middleware/auth');
const { validateMachine } = require('../../middleware/validators');
const authController = require("../../../auth/core/auth.controller");

// Machine routes (API key based)
router.post('/:id/ping', machineAuth, attendanceMachineController.machinePing);
router.post('/:id/sync', machineAuth, attendanceMachineController.syncMachine);

// All other routes require user authentication
router.use(authController.protect);

// User mapping routes
router.get('/unmapped-users', attendanceMachineController.getUnmappedUsers);
router.post('/map-user', attendanceMachineController.mapUserToMachine);
router.post('/bulk-map', attendanceMachineController.bulkMapUsers);
// Analytics
router.get('/analytics', attendanceMachineController.getMachineAnalytics);
// Machine status & operations
router.get('/:id/status', attendanceMachineController.getMachineStatus);
router.get('/:id/logs', attendanceMachineController.getMachineLogs);
router.post('/:id/test-connection', attendanceMachineController.testConnection);
router.post('/:id/regenerate-key', attendanceMachineController.regenerateApiKey);
// Bulk operations
router.post('/bulk-status', attendanceMachineController.bulkUpdateStatus);
// Standard CRUD
router.route('/')
  .get(attendanceMachineController.getAllMachines)
  .post(

    validateMachine,
    attendanceMachineController.createMachine
  );

router.route('/:id')
  .get(attendanceMachineController.getMachine)
  .patch(

    validateMachine,
    attendanceMachineController.updateMachine
  )
  .delete(attendanceMachineController.deleteMachine);

module.exports = router;