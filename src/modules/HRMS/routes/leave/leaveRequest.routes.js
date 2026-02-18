// routes/leave/leaveRequest.routes.js
const express = require('express');
const router = express.Router();
const leaveRequestController = require('../../controllers/leave/leaveRequest.controller');
const { protect, restrictTo } = require('../../middleware/auth');
const { validateLeaveRequest } = require('../../middleware/validators');

// All routes require authentication
router.use(protect);

// User-specific routes (must come before /:id)
router.get('/my-requests', leaveRequestController.getMyLeaveRequests);
router.get('/balance-summary', leaveRequestController.getLeaveBalanceSummary);
router.get('/pending-approvals', leaveRequestController.getPendingApprovals);

// Team/Manager routes
router.get('/team-calendar', restrictTo('manager', 'hr'), leaveRequestController.getTeamLeaveCalendar);

// Admin/HR routes
router.get('/analytics', restrictTo('admin', 'hr'), leaveRequestController.getLeaveAnalytics);
router.post('/bulk-approve', restrictTo('admin', 'hr'), leaveRequestController.bulkApproveLeaves);

// Approval actions
router.patch('/:id/approve', leaveRequestController.approveLeaveRequest);
router.patch('/:id/reject', leaveRequestController.rejectLeaveRequest);
router.patch('/:id/escalate', restrictTo('manager', 'hr'), leaveRequestController.escalateLeaveRequest);

// Standard CRUD
router.route('/')
  .get(leaveRequestController.getAllLeaveRequests)
  .post(
    validateLeaveRequest,
    leaveRequestController.createLeaveRequest
  );

router.route('/:id')
  .get(leaveRequestController.getLeaveRequest)
  .patch(
    validateLeaveRequest,
    leaveRequestController.updateLeaveRequest
  )
  .delete(leaveRequestController.cancelLeaveRequest);

module.exports = router;