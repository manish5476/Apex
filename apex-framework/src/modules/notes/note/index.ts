const router = require('./api/routes/note.routes');
const noteService = require('./application/services/note.service');
const { NOTE_EVENTS } = require('./events/note.events');

module.exports = {
  router,
  service: noteService,
  events: NOTE_EVENTS,
};
