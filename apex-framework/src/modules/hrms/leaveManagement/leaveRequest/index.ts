const router = require('./api/routes/leaveRequest.routes');
const leaveRequestService = require('./application/services/leaveRequest.service');
const { LEAVE_REQUEST_EVENTS } = require('./events/leaveRequest.events');

module.exports = {
  router,
  service: leaveRequestService,
  events: LEAVE_REQUEST_EVENTS,
};
