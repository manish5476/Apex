const express = require('express');
const leaveController = require('../../modules/hr/leave/leaveRequest.controller');
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

const router = express.Router();

router.use(authController.protect);

// Employee Routes
router.post('/apply', leaveController.createLeaveRequest);
router.get('/my-leaves', leaveController.getMyLeaves);
router.patch('/:id/cancel', leaveController.cancelLeave);

// Admin Routes
router.get('/admin/all', checkPermission(PERMISSIONS.LEAVE.READ), leaveController.getAllLeaves);
router.patch('/admin/:id/process', checkPermission(PERMISSIONS.LEAVE.MANAGE), leaveController.processLeave);

module.exports = router;