// routes/attendance/attendanceDaily.routes.js
const express = require('express');
const router = express.Router();
const attendanceDailyController = require('../../controllers/attendance/attendanceDaily.controller');
const authController = require("../../../auth/core/auth.controller");

router.use(authController.protect);

// User routes
router.get('/my-attendance', attendanceDailyController.getMyAttendance);
router.get('/today', attendanceDailyController.getTodayAttendance);

// Admin/HR routes
router.get('/dashboard',  attendanceDailyController.getAttendanceDashboard);
router.get('/report',  attendanceDailyController.getAttendanceReport);
router.get('/trends',  attendanceDailyController.getAttendanceTrends);
router.get('/export',  attendanceDailyController.exportAttendance);
router.post('/recalculate',  attendanceDailyController.recalculateDaily);
router.post('/bulk-update',  attendanceDailyController.bulkUpdateAttendance);

// Regularization
router.patch('/:id/regularize',  attendanceDailyController.regularizeAttendance);

// Standard CRUD
router.route('/')
  .get( attendanceDailyController.getAllDaily);

router.route('/:id')
  .get(attendanceDailyController.getDaily);

module.exports = router;