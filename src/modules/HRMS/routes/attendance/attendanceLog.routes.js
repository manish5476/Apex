const express = require('express');
const router = express.Router();
const attendanceLogController = require('../../controllers/attendance/attendanceLog.controller');
const { machineAuth } = require('../../middleware/auth');
const { validateAttendanceLog } = require('../../middleware/validators');
const authController = require("../../../auth/core/auth.controller");
const { checkPermission } = require("../../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../../config/permissions");

// ======================================================
// 1. MACHINE ACCESS (Biometric Devices / IOT)
// ======================================================
// No user protect here; uses API Key / machineAuth
router.post('/bulk', machineAuth, attendanceLogController.bulkCreateLogs);

// ======================================================
// 2. USER ACCESS (Requires Identity)
// ======================================================
router.use(authController.protect);

// Self-Service
router.get('/my-logs', 
  checkPermission(PERMISSIONS.ATTENDANCE.LOG_READ), 
  attendanceLogController.getMyLogs
);

// Manual Log Entry (e.g., if mobile app is used)
router.post('/', 
  checkPermission(PERMISSIONS.ATTENDANCE.LOG_READ), 
  validateAttendanceLog, 
  attendanceLogController.createAttendanceLog
);

// ======================================================
// 3. MONITORING & ADMIN (HR/Manager)
// ======================================================

// High-level monitoring
router.get('/stats', 
  checkPermission(PERMISSIONS.ATTENDANCE.LOG_READ), 
  attendanceLogController.getLogStats
);

router.get('/realtime-feed', 
  checkPermission(PERMISSIONS.ATTENDANCE.LOG_READ), 
  attendanceLogController.getRealtimeFeed
);

// Specific User History
router.get('/user/:userId', 
  checkPermission(PERMISSIONS.ATTENDANCE.LOG_READ), 
  attendanceLogController.getUserLogs
);

// ======================================================
// 4. LOG MODERATION (Destructive/Corrective)
// ======================================================

// Verify a flagged log
router.patch('/:id/verify', 
  checkPermission(PERMISSIONS.ATTENDANCE.LOG_MANAGE), 
  attendanceLogController.verifyLog
);

// Flag a suspicious log (e.g., mismatched GPS)
router.patch('/:id/flag', 
  checkPermission(PERMISSIONS.ATTENDANCE.LOG_MANAGE), 
  attendanceLogController.flagLog
);

// Manual Correction
router.patch('/:id/correct', 
  checkPermission(PERMISSIONS.ATTENDANCE.LOG_MANAGE), 
  attendanceLogController.correctLog
);

// ======================================================
// 5. STANDARD CRUD
// ======================================================

router.route('/')
  .get(checkPermission(PERMISSIONS.ATTENDANCE.LOG_READ), attendanceLogController.getAllLogs);

router.route('/:id')
  .get(checkPermission(PERMISSIONS.ATTENDANCE.LOG_READ), attendanceLogController.getLog);

module.exports = router;