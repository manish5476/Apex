const router = require('./api/routes/reviewCycle.routes');
const reviewCycleService = require('./application/services/reviewCycle.service');
const { REVIEW_CYCLE_EVENTS } = require('./events/reviewCycle.events');

module.exports = {
  router,
  service: reviewCycleService,
  events: REVIEW_CYCLE_EVENTS,
};
