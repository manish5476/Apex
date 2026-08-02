/**
 * src/modules/attendance/index.js
 * Module Entry Point for Attendance Bounded Context
 */

const express = require('express');
const router = express.Router();

// 1. Import Internal Routes (these should be properly created in routes folder)
// Example: const attendanceDailyRoutes = require('./routes/attendanceDaily.routes');

// 2. Import Public Services (Business logic exposed to OTHER modules)
// Example: const AttendanceService = require('./services/attendance.service');

// 3. Setup Module Router
// Example: router.use('/daily', attendanceDailyRoutes);

module.exports = {
  // Router to be mounted in the main Express app
  router,
  
  // Expose services that other modules are allowed to consume
  services: {
    // attendanceService: AttendanceService
  }
};
