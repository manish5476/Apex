// routes/attendanceRoutes.js
const express = require('express');
const attendanceController = require('../../controllers/attendanceController');
const attendanceWebController = require('../../controllers/attendanceWebController'); // For web punches
const authController = require('../../controllers/authController');
const { checkPermission, checkAnyPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require('../../config/permissions');

const router = express.Router();

// ==================== EMPLOYEE ROUTES ====================

// Web/Mobile Punch
router.post('/punch', 
  checkPermission(PERMISSIONS.ATTENDANCE.MARK), 
  attendanceWebController.markAttendance
);

// View own attendance
router.get('/my-history', 
  checkPermission(PERMISSIONS.ATTENDANCE.READ), 
  attendanceController.getMyAttendance
);

// View own requests
router.get('/my-requests', 
  checkPermission(PERMISSIONS.ATTENDANCE.READ), 
  attendanceController.getMyRequests
);

// Submit regularization
router.post('/regularize', 
  checkPermission(PERMISSIONS.ATTENDANCE.REGULARIZE), 
  attendanceController.submitRegularization
);

// Real-time subscriptions
router.post('/subscribe', 
  checkPermission(PERMISSIONS.ATTENDANCE.READ), 
  attendanceController.subscribeToUpdates
);

router.post('/unsubscribe', 
  checkPermission(PERMISSIONS.ATTENDANCE.READ), 
  attendanceController.unsubscribeFromUpdates
);

// ==================== MANAGER/ADMIN ROUTES ====================

// Pending requests
router.get('/requests/pending', 
  checkPermission(PERMISSIONS.ATTENDANCE.APPROVE), 
  attendanceController.getPendingRequests
);

// Approve/reject requests
router.patch('/regularize/:id', 
  checkPermission(PERMISSIONS.ATTENDANCE.APPROVE), 
  attendanceController.decideRegularization
);

// Team attendance
router.get('/team', 
  checkPermission(PERMISSIONS.ATTENDANCE.VIEW_ALL), 
  attendanceController.getTeamAttendance
);

// Live monitoring
router.get('/live', 
  checkPermission(PERMISSIONS.ATTENDANCE.REAL_TIME_MONITOR), 
  attendanceController.getLiveAttendance
);

// Summary dashboard
router.get('/summary', 
  checkPermission(PERMISSIONS.ATTENDANCE.VIEW_ANALYTICS), 
  attendanceController.getAttendanceSummary
);

// ==================== SHIFT MANAGEMENT ====================

router.post('/shifts', 
  checkPermission(PERMISSIONS.ATTENDANCE.MANAGE_SHIFTS), 
  attendanceController.createShift
);

router.get('/shifts', 
  checkPermission(PERMISSIONS.ATTENDANCE.READ), 
  attendanceController.getAllShifts
);

router.get('/shifts/:id', 
  checkPermission(PERMISSIONS.ATTENDANCE.READ), 
  attendanceController.getShiftById
);

router.patch('/shifts/:id', 
  checkPermission(PERMISSIONS.ATTENDANCE.MANAGE_SHIFTS), 
  attendanceController.updateShift
);

router.delete('/shifts/:id', 
  checkPermission(PERMISSIONS.ATTENDANCE.MANAGE_SHIFTS), 
  attendanceController.deleteShift
);

// ==================== HOLIDAY MANAGEMENT ====================

router.post('/holidays', 
  checkPermission(PERMISSIONS.ATTENDANCE.MANAGE_HOLIDAYS), 
  attendanceController.createHoliday
);

router.get('/holidays', 
  checkPermission(PERMISSIONS.ATTENDANCE.READ), 
  attendanceController.getHolidays
);

router.get('/holidays/:id', 
  checkPermission(PERMISSIONS.ATTENDANCE.READ), 
  attendanceController.getHolidayById
);

router.patch('/holidays/:id', 
  checkPermission(PERMISSIONS.ATTENDANCE.MANAGE_HOLIDAYS), 
  attendanceController.updateHoliday
);

router.delete('/holidays/:id', 
  checkPermission(PERMISSIONS.ATTENDANCE.MANAGE_HOLIDAYS), 
  attendanceController.deleteHoliday
);

// ==================== MACHINE INTEGRATION ====================

// Public endpoint for machine data (uses API key auth, not JWT)
router.post('/machine-push', 
  attendanceController.pushMachineData // Note: No permission check, uses API key
);

// ==================== EXPORT ROUTES ====================

// Export attendance data
router.get('/export', 
  checkPermission(PERMISSIONS.ATTENDANCE.EXPORT), 
  attendanceController.exportAttendance
);

// Monthly reports
router.get('/reports/monthly', 
  checkPermission(PERMISSIONS.ATTENDANCE.VIEW_ANALYTICS), 
  attendanceController.getMonthlyReport
);

// Analytics
router.get('/analytics', 
  checkPermission(PERMISSIONS.ATTENDANCE.VIEW_ANALYTICS), 
  attendanceController.getAnalytics
);

// Dashboard
router.get('/dashboard', 
  checkAnyPermission([PERMISSIONS.ATTENDANCE.VIEW_ANALYTICS, PERMISSIONS.ATTENDANCE.VIEW_ALL]), 
  attendanceController.getDashboard
);

module.exports = router;







// // routes/attendanceRoutes.js
// const express = require('express');
// const attendanceController = require('../../controllers/attendanceController'); // Machine + Web + Actions combined
// const authController = require('../../controllers/authController');
// const { checkPermission, checkRole } = require("../../middleware/permissionMiddleware");
// const { PERMISSIONS } = require('../../config/permissions');

// const router = express.Router();

// // ==================== EMPLOYEE ROUTES ====================
// router.post('/punch', 
//   checkPermission(PERMISSIONS.ATTENDANCE.MARK), 
//   attendanceController.markAttendance
// );

// router.get('/my-history', 
//   checkPermission(PERMISSIONS.ATTENDANCE.READ), 
//   attendanceController.getMyAttendance
// );

// router.post('/regularize', 
//   checkPermission(PERMISSIONS.ATTENDANCE.REGULARIZE), 
//   attendanceController.submitRegularization
// );

// router.get('/my-requests', 
//   checkPermission(PERMISSIONS.ATTENDANCE.READ), 
//   attendanceController.getMyRequests
// );

// router.post('/subscribe', 
//   checkPermission(PERMISSIONS.ATTENDANCE.READ), 
//   attendanceController.subscribeToUpdates
// );

// router.post('/unsubscribe', 
//   checkPermission(PERMISSIONS.ATTENDANCE.READ), 
//   attendanceController.unsubscribeFromUpdates
// );

// // ==================== MANAGER/ADMIN ROUTES ====================
// router.get('/requests/pending', 
//   checkPermission(PERMISSIONS.ATTENDANCE.APPROVE), 
//   attendanceController.getPendingRequests
// );

// router.patch('/regularize/:id', 
//   checkPermission(PERMISSIONS.ATTENDANCE.APPROVE), 
//   attendanceController.decideRegularization
// );

// router.get('/team', 
//   checkPermission(PERMISSIONS.ATTENDANCE.VIEW_ALL), 
//   attendanceController.getTeamAttendance
// );

// router.get('/summary', 
//   checkPermission(PERMISSIONS.ATTENDANCE.VIEW_ANALYTICS), 
//   attendanceController.getAttendanceSummary
// );

// router.get('/live', 
//   checkPermission(PERMISSIONS.ATTENDANCE.REAL_TIME_MONITOR), 
//   attendanceController.getLiveAttendance
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

// // ==================== BIOMETRIC MACHINE MANAGEMENT ====================
// router.post('/machines', 
//   checkPermission(PERMISSIONS.ATTENDANCE.MANAGE_MACHINES), 
//   attendanceController.createMachine
// );

// router.get('/machines', 
//   checkPermission(PERMISSIONS.ATTENDANCE.VIEW_ALL), 
//   attendanceController.getAllMachines
// );

// router.get('/machines/:id', 
//   checkPermission(PERMISSIONS.ATTENDANCE.VIEW_ALL), 
//   attendanceController.getMachineById
// );

// router.patch('/machines/:id', 
//   checkPermission(PERMISSIONS.ATTENDANCE.MANAGE_MACHINES), 
//   attendanceController.updateMachine
// );

// router.delete('/machines/:id', 
//   checkPermission(PERMISSIONS.ATTENDANCE.MANAGE_MACHINES), 
//   attendanceController.deleteMachine
// );

// router.post('/machines/:id/regenerate-key', 
//   checkPermission(PERMISSIONS.ATTENDANCE.MANAGE_MACHINES), 
//   attendanceController.regenerateMachineKey
// );

// // ==================== REPORTS & EXPORTS ====================
// router.get('/export', 
//   checkPermission(PERMISSIONS.ATTENDANCE.EXPORT), 
//   attendanceController.exportAttendance
// );

// router.get('/reports/monthly', 
//   checkPermission(PERMISSIONS.ATTENDANCE.VIEW_ANALYTICS), 
//   attendanceController.getMonthlyReport
// );

// router.get('/analytics', 
//   checkPermission(PERMISSIONS.ATTENDANCE.VIEW_ANALYTICS), 
//   attendanceController.getAnalytics
// );

// // ==================== BULK OPERATIONS ====================
// router.post('/bulk-update', 
//   checkPermission(PERMISSIONS.ATTENDANCE.BULK_UPDATE), 
//   attendanceController.bulkUpdateAttendance
// );

// router.post('/import', 
//   checkPermission(PERMISSIONS.ATTENDANCE.BULK_UPDATE), 
//   attendanceController.importAttendance
// );

// // ==================== MACHINE INTEGRATION (PUBLIC - API KEY AUTH) ====================
// // Note: This route uses API key authentication, not JWT
// router.post('/machine-push', 
//   attendanceController.pushMachineData
// );

// // ==================== ADMIN DASHBOARD ====================
// router.get('/dashboard', 
//   checkPermission(PERMISSIONS.ATTENDANCE.VIEW_ANALYTICS), 
//   attendanceController.getDashboard
// );

// module.exports = router;

// // const express = require('express');
// // const attendanceController = require('../../controllers/attendanceController'); // Machine Ingestion
// // const attendanceWebController = require('../../controllers/attendanceWebController'); // Web Punch
// // const attendanceActionsController = require('../../controllers/attendanceActionsController'); // Management
// // const authController = require('../../controllers/authController');
// // const { checkPermission, } = require("../../middleware/permissionMiddleware");
// // const { PERMISSIONS } = require('../../config/permissions');

// // const router = express.Router();
// // // Add checkPermission to these routes:
// // router.post('/punch', 
// //   checkPermission(PERMISSIONS.ATTENDANCE.MARK), 
// //   attendanceWebController.markAttendance
// // );

// // router.get('/my-history', 
// //   checkPermission(PERMISSIONS.ATTENDANCE.READ), 
// //   attendanceActionsController.getMyAttendance
// // );

// // router.post('/regularize', 
// //   checkPermission(PERMISSIONS.ATTENDANCE.REGULARIZE), 
// //   attendanceActionsController.submitRegularization
// // );

// // router.get('/requests/pending', 
// //   checkPermission(PERMISSIONS.ATTENDANCE.APPROVE), 
// //   attendanceActionsController.getPendingRequests
// // );

// // router.patch('/regularize/:id', 
// //   checkPermission(PERMISSIONS.ATTENDANCE.APPROVE), 
// //   attendanceActionsController.decideRegularization
// // );

// // module.exports = router;
