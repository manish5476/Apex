const router = require('./api/routes/masterType.routes');
const masterTypeService = require('./application/services/masterType.service');
const { MASTER_TYPE_EVENTS } = require('./events/masterType.events');

module.exports = {
  router,
  service: masterTypeService,
  events: MASTER_TYPE_EVENTS,
};
