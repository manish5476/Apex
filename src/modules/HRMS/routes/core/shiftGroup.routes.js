const express = require('express');
const router = express.Router();
const shiftGroupController = require('../../controllers/core/shiftGroup.controller');
const authController = require("../../../auth/core/auth.controller");
const { checkPermission } = require("../../../../core/middleware/permission.middleware");

const { PERMISSIONS } = require("../../../../config/permissions");

const { validateShiftGroup } = require('../../middleware/validators');

// Protect all routes globally
router.use(authController.protect);

// ======================================================
// 1. ROTATION LOGIC & AUTOMATION
// ======================================================

/**
 * Automates the creation of calendar entries based on 
 * the group's rotation pattern (e.g., 6/2 or 5/2).
 */
router.post('/:id/generate-schedule', 
  checkPermission(PERMISSIONS.SHIFT.GROUP_MANAGE), 
  shiftGroupController.generateRotationSchedule
);

/**
 * Link multiple users to this specific shift group/rotation.
 */
router.post('/:id/assign', 
  checkPermission(PERMISSIONS.SHIFT.GROUP_MANAGE), 
  shiftGroupController.assignGroupToUsers
);

// ======================================================
// 2. ASSIGNMENT VISIBILITY
// ======================================================

// View which employees are currently following this rotation
router.get('/:id/assignments', 
  checkPermission(PERMISSIONS.SHIFT.GROUP_READ), 
  shiftGroupController.getGroupAssignments
);

// ======================================================
// 3. CORE CRUD
// ======================================================

router.route('/')
  .get(checkPermission(PERMISSIONS.SHIFT.GROUP_READ), shiftGroupController.getAllShiftGroups)
  .post(
    checkPermission(PERMISSIONS.SHIFT.GROUP_MANAGE),
    validateShiftGroup, 
    shiftGroupController.createShiftGroup
  );

router.route('/:id')
  .get(checkPermission(PERMISSIONS.SHIFT.GROUP_READ), shiftGroupController.getShiftGroup)
  .patch(
    checkPermission(PERMISSIONS.SHIFT.GROUP_MANAGE),
    validateShiftGroup, 
    shiftGroupController.updateShiftGroup
  )
  .delete(
    checkPermission(PERMISSIONS.SHIFT.GROUP_MANAGE), 
    shiftGroupController.deleteShiftGroup
  );

module.exports = router;