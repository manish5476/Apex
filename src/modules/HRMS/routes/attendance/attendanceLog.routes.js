// routes/attendance/attendanceLog.routes.js
const express = require('express');
const router = express.Router();
const attendanceLogController = require('../../controllers/attendance/attendanceLog.controller');
const { protect, restrictTo, machineAuth } = require('../../middleware/auth');
const { validateAttendanceLog } = require('../../middleware/validators');

// Machine routes (API key based)
router.post('/bulk', machineAuth, attendanceLogController.bulkCreateLogs);
// All other routes require user authentication
router.use(protect);
// User routes
router.get('/my-logs', attendanceLogController.getMyLogs);
router.post('/', validateAttendanceLog, attendanceLogController.createAttendanceLog);

// Stats & feed
router.get('/stats', restrictTo('admin', 'hr'), attendanceLogController.getLogStats);
router.get('/realtime-feed', restrictTo('admin', 'hr'), attendanceLogController.getRealtimeFeed);

// Admin routes
router.get('/user/:userId', restrictTo('admin', 'hr'), attendanceLogController.getUserLogs);

// Log actions
router.patch('/:id/verify', restrictTo('admin', 'hr'), attendanceLogController.verifyLog);
router.patch('/:id/flag', restrictTo('admin', 'hr'), attendanceLogController.flagLog);
router.patch('/:id/correct', restrictTo('admin'), attendanceLogController.correctLog);

// Standard CRUD
router.route('/')
  .get(restrictTo('admin', 'hr'), attendanceLogController.getAllLogs);

router.route('/:id')
  .get(attendanceLogController.getLog);

module.exports = router;