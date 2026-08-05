const router = require('./api/routes/designation.routes');
const designationService = require('./application/services/designation.service');
const { DESIGNATION_EVENTS } = require('./events/designation.events');

module.exports = {
  router,
  service: designationService,
  events: DESIGNATION_EVENTS,
};
