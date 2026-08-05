const router = require('./api/routes/featureFlag.routes');
const featureFlagService = require('./application/services/featureFlag.service');
const { FEATURE_FLAG_EVENTS } = require('./events/featureFlag.events');

module.exports = {
  router,
  service: featureFlagService,
  events: FEATURE_FLAG_EVENTS,
};
