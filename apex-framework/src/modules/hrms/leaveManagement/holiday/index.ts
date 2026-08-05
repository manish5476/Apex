const router = require('./api/routes/holiday.routes');
const holidayService = require('./application/services/holiday.service');
const { HOLIDAY_EVENTS } = require('./events/holiday.events');

module.exports = {
  router,
  service: holidayService,
  events: HOLIDAY_EVENTS,
};
