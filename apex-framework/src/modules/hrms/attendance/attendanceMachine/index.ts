const router = require('./api/routes/attendanceMachine.routes');
const attendanceMachineService = require('./application/services/attendanceMachine.service');
const { ATTENDANCE_MACHINE_EVENTS } = require('./events/attendanceMachine.events');

module.exports = {
  router,
  service: attendanceMachineService,
  events: ATTENDANCE_MACHINE_EVENTS,
};
