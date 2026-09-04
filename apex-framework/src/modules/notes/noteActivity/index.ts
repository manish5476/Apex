const router = require('./api/routes/noteActivity.routes');
const noteActivityService = require('./application/services/noteActivity.service');
const { NOTE_ACTIVITY_EVENTS } = require('./events/noteActivity.events');

module.exports = {
  router,
  service: noteActivityService,
  events: NOTE_ACTIVITY_EVENTS,
};
