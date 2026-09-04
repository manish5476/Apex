const router = require('./api/routes/driver.routes');
const driverService = require('./application/services/driver.service');
const { DRIVER_EVENTS } = require('./events/driver.events');

module.exports = {
  router,
  service: driverService,
  events: DRIVER_EVENTS,
};
