// // routes/attendanceRoutes.js
// const express = require('express');
// const attendanceController = require('../../modules/hr/attendance/attendance.controller');
// const attendanceWebController = require('../../modules/hr/attendance/attendanceWeb.controller'); // For web punches
// const authController = require('../../modules/auth/core/auth.controller');
// const { checkPermission, checkAnyPermission } = require("../../core/middleware/permission.middleware");
// const { PERMISSIONS } = require('../../config/permissions');
// const router = express.Router();
// router.use(authController.protect);
// // ==================== EMPLOYEE ROUTES ====================
// // Web/Mobile Punch
// router.post('/punch', 
//   checkPermission(PERMISSIONS.ATTENDANCE.MARK), 
//   attendanceWebController.markAttendance
// );

// // View own attendance
// router.get('/my-history', 
//   checkPermission(PERMISSIONS.ATTENDANCE.READ), 
//   attendanceController.getMyAttendance
// );

// // View own requests
// router.get('/my-requests', 
//   checkPermission(PERMISSIONS.ATTENDANCE.READ), 
//   attendanceController.getMyRequests
// );

// // Submit regularization
// router.post('/regularize', 
//   checkPermission(PERMISSIONS.ATTENDANCE.REGULARIZE), 
//   attendanceController.submitRegularization
// );

// // Real-time subscriptions
// router.post('/subscribe', 
//   checkPermission(PERMISSIONS.ATTENDANCE.READ), 
//   attendanceController.subscribeToUpdates
// );

// router.post('/unsubscribe', 
//   checkPermission(PERMISSIONS.ATTENDANCE.READ), 
//   attendanceController.unsubscribeFromUpdates
// );

// // ==================== MANAGER/ADMIN ROUTES ====================

// // Pending requests
// router.get('/requests/pending', 
//   checkPermission(PERMISSIONS.ATTENDANCE.APPROVE), 
//   attendanceController.getPendingRequests
// );

// // Approve/reject requests
// router.patch('/regularize/:id', 
//   checkPermission(PERMISSIONS.ATTENDANCE.APPROVE), 
//   attendanceController.decideRegularization
// );

// // Team attendance
// router.get('/team', 
//   checkPermission(PERMISSIONS.ATTENDANCE.VIEW_ALL), 
//   attendanceController.getTeamAttendance
// );

// // Live monitoring
// router.get('/live', 
//   checkPermission(PERMISSIONS.ATTENDANCE.REAL_TIME_MONITOR), 
//   attendanceController.getLiveAttendance
// );

// // Summary dashboard
// router.get('/summary', 
//   checkPermission(PERMISSIONS.ATTENDANCE.VIEW_ANALYTICS), 
//   attendanceController.getAttendanceSummary
// );

// // ==================== SHIFT MANAGEMENT ====================

// router.post('/shifts', 
//   checkPermission(PERMISSIONS.ATTENDANCE.MANAGE_SHIFTS), 
//   attendanceController.createShift
// );

// router.get('/shifts', 
//   checkPermission(PERMISSIONS.ATTENDANCE.READ), 
//   attendanceController.getAllShifts
// );

// router.get('/shifts/:id', 
//   checkPermission(PERMISSIONS.ATTENDANCE.READ), 
//   attendanceController.getShiftById
// );

// router.patch('/shifts/:id', 
//   checkPermission(PERMISSIONS.ATTENDANCE.MANAGE_SHIFTS), 
//   attendanceController.updateShift
// );

// router.delete('/shifts/:id', 
//   checkPermission(PERMISSIONS.ATTENDANCE.MANAGE_SHIFTS), 
//   attendanceController.deleteShift
// );

// // ==================== HOLIDAY MANAGEMENT ====================

// router.post('/holidays', 
//   checkPermission(PERMISSIONS.ATTENDANCE.MANAGE_HOLIDAYS), 
//   attendanceController.createHoliday
// );

// router.get('/holidays', 
//   checkPermission(PERMISSIONS.ATTENDANCE.READ), 
//   attendanceController.getHolidays
// );

// router.get('/holidays/:id', 
//   checkPermission(PERMISSIONS.ATTENDANCE.READ), 
//   attendanceController.getHolidayById
// );

// router.patch('/holidays/:id', 
//   checkPermission(PERMISSIONS.ATTENDANCE.MANAGE_HOLIDAYS), 
//   attendanceController.updateHoliday
// );

// router.delete('/holidays/:id', 
//   checkPermission(PERMISSIONS.ATTENDANCE.MANAGE_HOLIDAYS), 
//   attendanceController.deleteHoliday
// );

// // ==================== MACHINE INTEGRATION ====================

// // Public endpoint for machine data (uses API key auth, not JWT)
// router.post('/machine-push', 
//   attendanceController.pushMachineData // Note: No permission check, uses API key
// );

// // ==================== EXPORT ROUTES ====================

// // Export attendance data
// router.get('/export', 
//   checkPermission(PERMISSIONS.ATTENDANCE.EXPORT), 
//   attendanceController.exportAttendance
// );

// // Monthly reports
// router.get('/reports/monthly', 
//   checkPermission(PERMISSIONS.ATTENDANCE.VIEW_ANALYTICS), 
//   attendanceController.getMonthlyReport
// );

// // Analytics
// router.get('/analytics', 
//   checkPermission(PERMISSIONS.ATTENDANCE.VIEW_ANALYTICS), 
//   attendanceController.getAnalytics
// );

// // Dashboard
// router.get('/dashboard', 
//   checkAnyPermission([PERMISSIONS.ATTENDANCE.VIEW_ANALYTICS, PERMISSIONS.ATTENDANCE.VIEW_ALL]), 
//   attendanceController.getDashboard
// );

// module.exports = router;