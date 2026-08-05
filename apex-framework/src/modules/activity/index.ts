const router = require('./api/routes/activity.routes');
const activityService = require('./application/services/activity.service');
const { ACTIVITY_EVENTS } = require('./events/activity.events');

module.exports = {
  router,
  service: activityService,
  events: ACTIVITY_EVENTS,
};
