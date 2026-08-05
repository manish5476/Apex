const router = require('./api/routes/shiftGroup.routes');
const shiftGroupService = require('./application/services/shiftGroup.service');
const { SHIFT_GROUP_EVENTS } = require('./events/shiftGroup.events');

module.exports = {
  router,
  service: shiftGroupService,
  events: SHIFT_GROUP_EVENTS,
};
