const express = require("express");
const router = express.Router();
const attendanceController = require("../controllers/attendance.controller");
const authController = require("../../auth/core/auth.controller");

// Protect all routes
router.use(authController.protect);

// ======================================================
//  EMPLOYEE ACTIONS (Self-Service)
// ======================================================

// The core "Check-In / Check-Out" endpoint
router.post("/punch", attendanceController.punch);

// View my own history
router.get("/me", attendanceController.getMyAttendance);

// View today's specific status (for dashboard widget)
router.get("/today", attendanceController.getTodaysStatus);

// ======================================================
//  ADMIN ACTIONS (Reports & Corrections)
// ======================================================
// Add these later when you build the Admin Attendance Reports
// router.get("/", authController.restrictTo('admin', 'hr'), attendanceController.getAllAttendance);

module.exports = router;