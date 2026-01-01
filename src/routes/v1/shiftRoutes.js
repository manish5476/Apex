const express = require('express');
const shiftController = require('../../controllers/shiftController');
const authController = require('../../controllers/authController');
const { checkPermission, } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require('../../config/permissions');

const router = express.Router();

// 🔒 All routes require login
router.use(authController.protect);

// Replace authController.restrictTo with checkPermission:
router.route('/')
  .get(checkPermission(PERMISSIONS.SHIFT.READ), shiftController.getAllShifts)
  .post(checkPermission(PERMISSIONS.SHIFT.MANAGE), shiftController.createShift);

router.route('/:id')
  .get(checkPermission(PERMISSIONS.SHIFT.READ), shiftController.getShiftById)
  .patch(checkPermission(PERMISSIONS.SHIFT.MANAGE), shiftController.updateShift)
  .delete(checkPermission(PERMISSIONS.SHIFT.MANAGE), shiftController.deleteShift);

module.exports = router;