const router = require('./api/routes/fieldService.routes');
const fieldServiceService = require('./application/services/fieldService.service');
const { FIELD_SERVICE_EVENTS } = require('./events/fieldService.events');

module.exports = {
  router,
  service: fieldServiceService,
  events: FIELD_SERVICE_EVENTS,
};
