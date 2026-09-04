const router = require('./api/routes/attendanceRequest.routes');
const attendanceRequestService = require('./application/services/attendanceRequest.service');
const { ATTENDANCE_REQUEST_EVENTS } = require('./events/attendanceRequest.events');

module.exports = {
  router,
  service: attendanceRequestService,
  events: ATTENDANCE_REQUEST_EVENTS,
};
