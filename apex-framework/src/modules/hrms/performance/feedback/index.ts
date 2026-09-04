const router = require('./api/routes/feedback.routes');
const feedbackService = require('./application/services/feedback.service');
const { FEEDBACK_EVENTS } = require('./events/feedback.events');

module.exports = {
  router,
  service: feedbackService,
  events: FEEDBACK_EVENTS,
};
