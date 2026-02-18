// routes/leave/leaveBalance.routes.js
const express = require('express');
const router = express.Router();
const leaveBalanceController = require('../../controllers/leave/leaveBalance.controller');
const { protect, restrictTo } = require('../../middleware/auth');

router.use(protect);

// User routes
router.get('/my-balance', leaveBalanceController.getMyLeaveBalance);

// Admin/HR routes
router.get('/report', restrictTo('admin', 'hr'), leaveBalanceController.getLeaveBalanceReport);
router.get('/utilization-trends', restrictTo('admin', 'hr'), leaveBalanceController.getUtilizationTrends);
router.post('/initialize', restrictTo('admin'), leaveBalanceController.initializeLeaveBalance);
router.post('/bulk-initialize', restrictTo('admin'), leaveBalanceController.bulkInitializeLeaveBalances);
router.post('/accrue-monthly', restrictTo('admin'), leaveBalanceController.accrueMonthlyLeave);

// Standard CRUD (admin only for writes)
router.route('/')
  .get(restrictTo('admin', 'hr'), leaveBalanceController.getAllLeaveBalances);

router.route('/:id')
  .get(leaveBalanceController.getLeaveBalance)
  .patch(restrictTo('admin'), leaveBalanceController.updateLeaveBalance);

module.exports = router;