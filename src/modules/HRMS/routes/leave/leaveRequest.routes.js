const express = require('express');
const router = express.Router();
const leaveRequestController = require('../../controllers/leave/leaveRequest.controller');
const authController = require("../../../auth/core/auth.controller");
const { checkPermission } = require("../../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../../config/permissions");
const { validateLeaveRequest } = require('../../middleware/validators');

// Protect all routes globally
router.use(authController.protect);

// ======================================================
// 1. EMPLOYEE SELF-SERVICE (Self-facing)
// ======================================================

router.get('/my-requests', 
  checkPermission(PERMISSIONS.LEAVE.READ), 
  leaveRequestController.getMyLeaveRequests
);

router.get('/balance-summary', 
  checkPermission(PERMISSIONS.LEAVE.READ), 
  leaveRequestController.getLeaveBalanceSummary
);

// ======================================================
// 2. MANAGERIAL WORKFLOW (Approval Layer)
// ======================================================

// Dashboard for managers to see who needs an answer
router.get('/pending-approvals', 
  checkPermission(PERMISSIONS.LEAVE.APPROVE), 
  leaveRequestController.getPendingApprovals
);

// Visibility to prevent scheduling conflicts
router.get('/team-calendar', 
  checkPermission(PERMISSIONS.LEAVE.READ), 
  leaveRequestController.getTeamLeaveCalendar
);

// Specific Approval Actions
router.patch('/:id/approve', 
  checkPermission(PERMISSIONS.LEAVE.APPROVE), 
  leaveRequestController.approveLeaveRequest
);

router.patch('/:id/reject', 
  checkPermission(PERMISSIONS.LEAVE.APPROVE), 
  leaveRequestController.rejectLeaveRequest
);

router.patch('/:id/escalate', 
  checkPermission(PERMISSIONS.LEAVE.APPROVE), 
  leaveRequestController.escalateLeaveRequest
);

// ======================================================
// 3. ADMINISTRATIVE OVERSIGHT (HR/Admin)
// ======================================================

router.get('/analytics', 
  checkPermission(PERMISSIONS.LEAVE.ADMIN), 
  leaveRequestController.getLeaveAnalytics
);

router.post('/bulk-approve', 
  checkPermission(PERMISSIONS.LEAVE.ADMIN), 
  leaveRequestController.bulkApproveLeaves
);

// ======================================================
// 4. CORE CRUD
// ======================================================

router.route('/')
  .get(checkPermission(PERMISSIONS.LEAVE.ADMIN), leaveRequestController.getAllLeaveRequests)
  .post(
    checkPermission(PERMISSIONS.LEAVE.REQUEST), 
    validateLeaveRequest, 
    leaveRequestController.createLeaveRequest
  );

router.route('/:id')
  .get(checkPermission(PERMISSIONS.LEAVE.READ), leaveRequestController.getLeaveRequest)
  .patch(
    checkPermission(PERMISSIONS.LEAVE.REQUEST), 
    validateLeaveRequest, 
    leaveRequestController.updateLeaveRequest
  )
  .delete(
    checkPermission(PERMISSIONS.LEAVE.REQUEST), 
    leaveRequestController.cancelLeaveRequest
  );

module.exports = router;