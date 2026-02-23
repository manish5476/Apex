// routes/attendance/attendanceDaily.routes.js
const express = require('express');
const router = express.Router();
const attendanceDailyController = require('../../controllers/attendance/attendanceDaily.controller');
const authController = require("../../../auth/core/auth.controller");
const { checkPermission } = require("../../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../../config/permissions");

// All routes require login
router.use(authController.protect);

// ======================================================
// 1. EMPLOYEE SELF-SERVICE (READ)
// ======================================================

// Get logged-in user's history
router.get('/my-attendance', 
  checkPermission(PERMISSIONS.ATTENDANCE.READ), 
  attendanceDailyController.getMyAttendance
);

// Get logged-in user's status for today
router.get('/today', 
  checkPermission(PERMISSIONS.ATTENDANCE.READ), 
  attendanceDailyController.getTodayAttendance
);

// ======================================================
// 2. HR & ADMINISTRATIVE CONTROLS (MANAGE)
// ======================================================

// Analytics & Reporting
router.get('/dashboard', 
  checkPermission(PERMISSIONS.ATTENDANCE.MANAGE), 
  attendanceDailyController.getAttendanceDashboard
);

router.get('/report', 
  checkPermission(PERMISSIONS.ATTENDANCE.MANAGE), 
  attendanceDailyController.getAttendanceReport
);

router.get('/trends', 
  checkPermission(PERMISSIONS.ATTENDANCE.MANAGE), 
  attendanceDailyController.getAttendanceTrends
);

// Exports & Data Processing
router.get('/export', 
  checkPermission(PERMISSIONS.ATTENDANCE.MANAGE), 
  attendanceDailyController.exportAttendance
);

router.post('/recalculate', 
  checkPermission(PERMISSIONS.ATTENDANCE.MANAGE), 
  attendanceDailyController.recalculateDaily
);

router.post('/bulk-update', 
  checkPermission(PERMISSIONS.ATTENDANCE.MANAGE), 
  attendanceDailyController.bulkUpdateAttendance
);

// ======================================================
// 3. REGULARIZATION & CRUD
// ======================================================

// Regularization usually has its own approval workflow
router.patch('/:id/regularize', 
  checkPermission(PERMISSIONS.ATTENDANCE.REGULARIZE), 
  attendanceDailyController.regularizeAttendance
);

// Standard Listing (Filtered by hierarchy in controller)
router.route('/')
  .get(checkPermission(PERMISSIONS.ATTENDANCE.READ), attendanceDailyController.getAllDaily);

router.route('/:id')
  .get(checkPermission(PERMISSIONS.ATTENDANCE.READ), attendanceDailyController.getDaily);

module.exports = router;