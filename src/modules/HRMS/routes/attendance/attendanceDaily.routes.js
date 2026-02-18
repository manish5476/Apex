// routes/attendance/attendanceDaily.routes.js
const express = require('express');
const router = express.Router();
const attendanceDailyController = require('../../controllers/attendance/attendanceDaily.controller');
const { protect, restrictTo } = require('../../middleware/auth');

router.use(protect);

// User routes
router.get('/my-attendance', attendanceDailyController.getMyAttendance);
router.get('/today', attendanceDailyController.getTodayAttendance);

// Admin/HR routes
router.get('/dashboard', restrictTo('admin', 'hr'), attendanceDailyController.getAttendanceDashboard);
router.get('/report', restrictTo('admin', 'hr'), attendanceDailyController.getAttendanceReport);
router.get('/trends', restrictTo('admin', 'hr'), attendanceDailyController.getAttendanceTrends);
router.get('/export', restrictTo('admin', 'hr'), attendanceDailyController.exportAttendance);
router.post('/recalculate', restrictTo('admin'), attendanceDailyController.recalculateDaily);
router.post('/bulk-update', restrictTo('admin'), attendanceDailyController.bulkUpdateAttendance);

// Regularization
router.patch('/:id/regularize', restrictTo('admin', 'hr'), attendanceDailyController.regularizeAttendance);

// Standard CRUD
router.route('/')
  .get(restrictTo('admin', 'hr'), attendanceDailyController.getAllDaily);

router.route('/:id')
  .get(attendanceDailyController.getDaily);

module.exports = router;