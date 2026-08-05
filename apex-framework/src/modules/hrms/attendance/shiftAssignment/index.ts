const router = require('./api/routes/shiftAssignment.routes');
const shiftAssignmentService = require('./application/services/shiftAssignment.service');
const { SHIFT_ASSIGNMENT_EVENTS } = require('./events/shiftAssignment.events');

module.exports = {
  router,
  service: shiftAssignmentService,
  events: SHIFT_ASSIGNMENT_EVENTS,
};
