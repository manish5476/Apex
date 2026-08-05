const router = require('./api/routes/shift.routes');
const shiftService = require('./application/services/shift.service');
const { SHIFT_EVENTS } = require('./events/shift.events');

module.exports = {
  router,
  service: shiftService,
  events: SHIFT_EVENTS,
};
