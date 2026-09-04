const router = require('./api/routes/vehicle.routes');
const vehicleService = require('./application/services/vehicle.service');
const { VEHICLE_EVENTS } = require('./events/vehicle.events');

module.exports = {
  router,
  service: vehicleService,
  events: VEHICLE_EVENTS,
};
