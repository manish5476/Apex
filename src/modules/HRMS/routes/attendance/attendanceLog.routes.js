// routes/attendance/attendanceLog.routes.js
const express = require('express');
const router = express.Router();
const attendanceLogController = require('../../controllers/attendance/attendanceLog.controller');
const {  machineAuth } = require('../../middleware/auth');
const { validateAttendanceLog } = require('../../middleware/validators');
const authController = require("../../../auth/core/auth.controller");

// Machine routes (API key based)
router.post('/bulk', machineAuth, attendanceLogController.bulkCreateLogs);
// All other routes require user authentication
router.use(authController.protect);
// User routes
router.get('/my-logs', attendanceLogController.getMyLogs);
router.post('/', validateAttendanceLog, attendanceLogController.createAttendanceLog);

// Stats & feed
router.get('/stats',  attendanceLogController.getLogStats);
router.get('/realtime-feed',  attendanceLogController.getRealtimeFeed);

// Admin routes
router.get('/user/:userId',  attendanceLogController.getUserLogs);

// Log actions
router.patch('/:id/verify',  attendanceLogController.verifyLog);
router.patch('/:id/flag',  attendanceLogController.flagLog);
router.patch('/:id/correct',  attendanceLogController.correctLog);

// Standard CRUD
router.route('/')
  .get( attendanceLogController.getAllLogs);

router.route('/:id')
  .get(attendanceLogController.getLog);

module.exports = router;