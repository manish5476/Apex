const express = require('express');
const router = express.Router();
const attendanceMachineController = require('../../controllers/attendance/attendanceMachine.controller');
const { machineAuth } = require('../../middleware/auth');
const { validateMachine } = require('../../middleware/validators');
const authController = require("../../../auth/core/auth.controller");
const { checkPermission } = require("../../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../../config/permissions");

// ======================================================
// 1. HARDWARE COMMUNICATION (API Key / machineAuth)
// ======================================================

// These routes do NOT use authController.protect as they are hit by the hardware
router.post('/:id/ping', machineAuth, attendanceMachineController.machinePing);
router.post('/:id/sync', machineAuth, attendanceMachineController.syncMachine);

// ======================================================
// 2. ADMINISTRATIVE & USER ROUTES (Human Only)
// ======================================================
router.use(authController.protect);

// User Mapping (Linking Biometric IDs to DB Users)
router.get('/unmapped-users', 
  checkPermission(PERMISSIONS.ATTENDANCE.MACHINE_READ), 
  attendanceMachineController.getUnmappedUsers
);

router.post('/map-user', 
  checkPermission(PERMISSIONS.ATTENDANCE.MACHINE_MANAGE), 
  attendanceMachineController.mapUserToMachine
);

router.post('/bulk-map', 
  checkPermission(PERMISSIONS.ATTENDANCE.MACHINE_MANAGE), 
  attendanceMachineController.bulkMapUsers
);

// Analytics & Monitoring
router.get('/analytics', 
  checkPermission(PERMISSIONS.ATTENDANCE.MACHINE_READ), 
  attendanceMachineController.getMachineAnalytics
);

// ======================================================
// 3. MACHINE OPERATIONS & SECURITY
// ======================================================

router.get('/:id/status', checkPermission(PERMISSIONS.ATTENDANCE.MACHINE_READ), attendanceMachineController.getMachineStatus);
router.get('/:id/logs', checkPermission(PERMISSIONS.ATTENDANCE.MACHINE_READ), attendanceMachineController.getMachineLogs);

router.post('/:id/test-connection', checkPermission(PERMISSIONS.ATTENDANCE.MACHINE_READ), attendanceMachineController.testConnection);

// High-security action
router.post('/:id/regenerate-key', 
  checkPermission(PERMISSIONS.ATTENDANCE.MACHINE_MANAGE), 
  attendanceMachineController.regenerateApiKey
);

// ======================================================
// 4. STANDARD CRUD
// ======================================================

router.route('/')
  .get(checkPermission(PERMISSIONS.ATTENDANCE.MACHINE_READ), attendanceMachineController.getAllMachines)
  .post(
    checkPermission(PERMISSIONS.ATTENDANCE.MACHINE_MANAGE),
    validateMachine, 
    attendanceMachineController.createMachine
  );

router.route('/:id')
  .get(checkPermission(PERMISSIONS.ATTENDANCE.MACHINE_READ), attendanceMachineController.getMachine)
  .patch(
    checkPermission(PERMISSIONS.ATTENDANCE.MACHINE_MANAGE),
    validateMachine, 
    attendanceMachineController.updateMachine
  )
  .delete(
    checkPermission(PERMISSIONS.ATTENDANCE.MACHINE_MANAGE), 
    attendanceMachineController.deleteMachine
  );

module.exports = router;