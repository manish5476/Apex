const router = require('./api/routes/user.routes');
const userService = require('./application/services/user.service');
const { USER_EVENTS } = require('./events/user.events');

module.exports = {
  router,
  service: userService,
  events: USER_EVENTS,
};
