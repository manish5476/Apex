const router = require('./api/routes/notificationCore.routes');
const notificationCoreService = require('./application/services/notificationCore.service');
const { NOTIFICATION_CORE_EVENTS } = require('./events/notificationCore.events');

module.exports = {
  router,
  service: notificationCoreService,
  events: NOTIFICATION_CORE_EVENTS,
};
