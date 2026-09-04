const router = require('./api/routes/attendanceLog.routes');
const attendanceLogService = require('./application/services/attendanceLog.service');
const { ATTENDANCE_LOG_EVENTS } = require('./events/attendanceLog.events');

module.exports = {
  router,
  service: attendanceLogService,
  events: ATTENDANCE_LOG_EVENTS,
};
