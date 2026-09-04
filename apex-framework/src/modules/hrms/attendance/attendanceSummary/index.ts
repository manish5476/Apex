const router = require('./api/routes/attendanceSummary.routes');
const attendanceSummaryService = require('./application/services/attendanceSummary.service');
const { ATTENDANCE_SUMMARY_EVENTS } = require('./events/attendanceSummary.events');

module.exports = {
  router,
  service: attendanceSummaryService,
  events: ATTENDANCE_SUMMARY_EVENTS,
};
