const router = require('./api/routes/goal.routes');
const goalService = require('./application/services/goal.service');
const { GOAL_EVENTS } = require('./events/goal.events');

module.exports = {
  router,
  service: goalService,
  events: GOAL_EVENTS,
};
