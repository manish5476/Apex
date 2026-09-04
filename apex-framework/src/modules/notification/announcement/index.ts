const router = require('./api/routes/announcement.routes');
const announcementService = require('./application/services/announcement.service');
const { ANNOUNCEMENT_EVENTS } = require('./events/announcement.events');

module.exports = {
  router,
  service: announcementService,
  events: ANNOUNCEMENT_EVENTS,
};
