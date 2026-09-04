const router = require('./api/routes/attendanceDaily.routes');
const attendanceDailyService = require('./application/services/attendanceDaily.service');
const { ATTENDANCE_DAILY_EVENTS } = require('./events/attendanceDaily.events');

module.exports = {
  router,
  service: attendanceDailyService,
  events: ATTENDANCE_DAILY_EVENTS,
};
