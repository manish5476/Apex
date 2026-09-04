const router = require('./api/routes/noteComment.routes');
const noteCommentService = require('./application/services/noteComment.service');
const { NOTE_COMMENT_EVENTS } = require('./events/noteComment.events');

module.exports = {
  router,
  service: noteCommentService,
  events: NOTE_COMMENT_EVENTS,
};
