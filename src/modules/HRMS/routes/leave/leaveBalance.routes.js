const express = require('express');
const router = express.Router();
const leaveBalanceController = require('../../controllers/leave/leaveBalance.controller');
const authController = require("../../../auth/core/auth.controller");
const { checkPermission } = require("../../../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../../../config/permissions");


// Protect all routes globally
router.use(authController.protect);

// ======================================================
// 1. EMPLOYEE SELF-SERVICE
// ======================================================

// Get current user's available leave (Sick, Casual, Earned, etc.)
router.get('/my-balance', 
  checkPermission(PERMISSIONS.LEAVE.BALANCE_READ), 
  leaveBalanceController.getMyLeaveBalance
);

// ======================================================
// 2. ANALYTICS & REPORTING (HR/Admin)
// ======================================================

router.get('/report', 
  checkPermission(PERMISSIONS.LEAVE.BALANCE_READ), 
  leaveBalanceController.getLeaveBalanceReport
);

router.get('/utilization-trends', 
  checkPermission(PERMISSIONS.LEAVE.BALANCE_READ), 
  leaveBalanceController.getUtilizationTrends
);

// ======================================================
// 3. ACCRUAL & INITIALIZATION (High-Security)
// ======================================================

// Setup leave for a new employee
router.post('/initialize', 
  checkPermission(PERMISSIONS.LEAVE.BALANCE_MANAGE), 
  leaveBalanceController.initializeLeaveBalance
);

// Setup leave for the entire company or department
router.post('/bulk-initialize', 
  checkPermission(PERMISSIONS.LEAVE.BALANCE_MANAGE), 
  leaveBalanceController.bulkInitializeLeaveBalances
);

/**
 * Trigger the periodic addition of leave days 
 * (e.g., adding 1.5 days to Earned Leave every month)
 */
router.post('/accrue-monthly', 
  checkPermission(PERMISSIONS.LEAVE.BALANCE_MANAGE), 
  leaveBalanceController.accrueMonthlyLeave
);

// ======================================================
// 4. STANDARD CRUD
// ======================================================

router.route('/')
  .get(
    checkPermission(PERMISSIONS.LEAVE.BALANCE_READ), 
    leaveBalanceController.getAllLeaveBalances
  );

router.route('/:id')
  .get(
    checkPermission(PERMISSIONS.LEAVE.BALANCE_READ), 
    leaveBalanceController.getLeaveBalance
  )
  .patch(
    checkPermission(PERMISSIONS.LEAVE.BALANCE_MANAGE), 
    leaveBalanceController.updateLeaveBalance
  );

module.exports = router;