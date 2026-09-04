const router = require('./api/routes/storefrontSession.routes');
const storefrontSessionService = require('./application/services/storefrontSession.service');
const { STOREFRONT_SESSION_EVENTS } = require('./events/storefrontSession.events');

module.exports = {
  router,
  service: storefrontSessionService,
  events: STOREFRONT_SESSION_EVENTS,
};
