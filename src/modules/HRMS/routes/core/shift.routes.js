const express = require('express');
const router = express.Router();
const shiftController = require('../../controllers/core/shift.controller');
const authController = require("../../../auth/core/auth.controller");
const { checkPermission } = require("../../../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../../../config/permissions");

const { validateShift } = require('../../middleware/validators');

// Protect all routes globally
router.use(authController.protect);

// ======================================================
// 1. OPERATIONAL ANALYTICS & UTILS
// ======================================================

// Visual representation of shifts across a 24-hour block
router.get('/timeline', 
  checkPermission(PERMISSIONS.SHIFT.READ), 
  shiftController.getShiftTimeline
);

// Check if enough staff are assigned to maintain operations
router.get('/coverage', 
  checkPermission(PERMISSIONS.SHIFT.READ), 
  shiftController.getShiftCoverage
);

// Utility for calculating work duration minus break times
router.post('/calculate-hours', 
  checkPermission(PERMISSIONS.SHIFT.READ), 
  shiftController.calculateShiftHours
);

// Validate if a shift conflict exists for a specific user
router.post('/validate-assignment', 
  checkPermission(PERMISSIONS.SHIFT.READ), 
  shiftController.validateShiftAssignment
);

// ======================================================
// 2. TEMPLATE MANAGEMENT (Admin/HR)
// ======================================================

// Create a new shift based on an existing one
router.post('/:id/clone', 
  checkPermission(PERMISSIONS.SHIFT.MANAGE), 
  shiftController.cloneShift
);

// ======================================================
// 3. CORE CRUD & ASSIGNMENT LISTING
// ======================================================

router.route('/')
  .get(checkPermission(PERMISSIONS.SHIFT.READ), shiftController.getAllShifts)
  .post(
    checkPermission(PERMISSIONS.SHIFT.MANAGE),
    validateShift, 
    shiftController.createShift
  );

// View all employees currently assigned to a specific shift
router.get('/:id/assignments', 
  checkPermission(PERMISSIONS.SHIFT.READ), 
  shiftController.getShiftAssignments
);

router.route('/:id')
  .get(checkPermission(PERMISSIONS.SHIFT.READ), shiftController.getShift)
  .patch(
    checkPermission(PERMISSIONS.SHIFT.MANAGE),
    validateShift, 
    shiftController.updateShift
  )
  .delete(
    checkPermission(PERMISSIONS.SHIFT.MANAGE), 
    shiftController.deleteShift
  );

module.exports = router;