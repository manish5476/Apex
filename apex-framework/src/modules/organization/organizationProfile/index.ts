const router = require('./api/routes/organizationProfile.routes');
const organizationProfileService = require('./application/services/organizationProfile.service');
const { ORGANIZATION_PROFILE_EVENTS } = require('./events/organizationProfile.events');

module.exports = {
  router,
  service: organizationProfileService,
  events: ORGANIZATION_PROFILE_EVENTS,
};
