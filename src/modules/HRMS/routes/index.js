// routes/v1/hrms.routes.js
const express = require('express');
const router = express.Router();

// Import HRMS route modules
const departmentRoutes = require('./core/department.routes');
const designationRoutes = require('./core/designation.routes');
const shiftRoutes = require('./core/shift.routes');
const shiftGroupRoutes = require('./core/shiftGroup.routes');
const leaveRequestRoutes = require('./leave/leaveRequest.routes');
const leaveBalanceRoutes = require('./leave/leaveBalance.routes');
const attendanceLogRoutes = require('./attendance/attendanceLog.routes');
const attendanceDailyRoutes = require('./attendance/attendanceDaily.routes');
const attendanceMachineRoutes = require('./attendance/attendanceMachine.routes');
const geoFenceRoutes = require('./attendance/geoFence.routes');
const holidayRoutes = require('./attendance/holiday.routes');

// Health check specific to HRMS (optional)
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'HRMS API is running',
    timestamp: new Date().toISOString()
  });
});

// Mount all HRMS routes under /hrms
router.use('/departments', departmentRoutes);
router.use('/designations', designationRoutes);
router.use('/shifts', shiftRoutes);
router.use('/shift-groups', shiftGroupRoutes);
router.use('/leave-requests', leaveRequestRoutes);
router.use('/leave-balances', leaveBalanceRoutes);
router.use('/attendance/logs', attendanceLogRoutes);
router.use('/attendance/daily', attendanceDailyRoutes);
router.use('/attendance/machines', attendanceMachineRoutes);
router.use('/attendance/geofences', geoFenceRoutes);
router.use('/attendance/holidays', holidayRoutes);

module.exports = router;

// // routes/index.js
// const express = require('express');
// const router = express.Router();

// // Import all route modules
// const departmentRoutes = require('./core/department.routes');
// const designationRoutes = require('./core/designation.routes');
// const shiftRoutes = require('./core/shift.routes');
// const shiftGroupRoutes = require('./core/shiftGroup.routes');
// const leaveRequestRoutes = require('./leave/leaveRequest.routes');
// const leaveBalanceRoutes = require('./leave/leaveBalance.routes');
// const attendanceLogRoutes = require('./attendance/attendanceLog.routes');
// const attendanceDailyRoutes = require('./attendance/attendanceDaily.routes');
// const attendanceMachineRoutes = require('./attendance/attendanceMachine.routes');
// const geoFenceRoutes = require('./attendance/geoFence.routes');
// const holidayRoutes = require('./attendance/holiday.routes');

// // Health check endpoint
// router.get('/health', (req, res) => {
//   res.status(200).json({
//     status: 'success',
//     message: 'HRMS API is running',
//     timestamp: new Date().toISOString()
//   });
// });

// // Mount routes
// router.use('/departments', departmentRoutes);
// router.use('/designations', designationRoutes);
// router.use('/shifts', shiftRoutes);
// router.use('/shift-groups', shiftGroupRoutes);
// router.use('/leave-requests', leaveRequestRoutes);
// router.use('/leave-balances', leaveBalanceRoutes);
// router.use('/attendance/logs', attendanceLogRoutes);
// router.use('/attendance/daily', attendanceDailyRoutes);
// router.use('/attendance/machines', attendanceMachineRoutes);
// router.use('/attendance/geofences', geoFenceRoutes);
// router.use('/attendance/holidays', holidayRoutes);

// module.exports = router;