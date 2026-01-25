const express = require('express');
const attendanceRouter = require('./routes/attendance.routes');
const leaveRouter = require('./routes/leave.routes');
const holidayRouter = require('./routes/holiday.routes');
const shiftRouter = require('./routes/shift.routes');

const router = express.Router();

// API version prefix
router.use('/attendance', attendanceRouter);
router.use('/leaves', leaveRouter);
router.use('/holidays', holidayRouter);
router.use('/shifts', shiftRouter);

module.exports = router;