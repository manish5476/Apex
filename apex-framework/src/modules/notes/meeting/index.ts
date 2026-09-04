const router = require('./api/routes/meeting.routes');
const meetingService = require('./application/services/meeting.service');
const { MEETING_EVENTS } = require('./events/meeting.events');

module.exports = {
  router,
  service: meetingService,
  events: MEETING_EVENTS,
};
