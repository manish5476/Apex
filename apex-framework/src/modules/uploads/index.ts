const router = require('./api/routes/uploads.routes');
const uploadsService = require('./application/services/uploads.service');
const { UPLOADS_EVENTS } = require('./events/uploads.events');

module.exports = {
  router,
  service: uploadsService,
  events: UPLOADS_EVENTS,
};
