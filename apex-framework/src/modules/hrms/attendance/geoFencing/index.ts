const router = require('./api/routes/geoFencing.routes');
const geoFencingService = require('./application/services/geoFencing.service');
const { GEO_FENCING_EVENTS } = require('./events/geoFencing.events');

module.exports = {
  router,
  service: geoFencingService,
  events: GEO_FENCING_EVENTS,
};
