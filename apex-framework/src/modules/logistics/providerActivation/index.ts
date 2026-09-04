const router = require('./api/routes/providerActivation.routes');
const providerActivationService = require('./application/services/providerActivation.service');
const { PROVIDER_ACTIVATION_EVENTS } = require('./events/providerActivation.events');

module.exports = {
  router,
  service: providerActivationService,
  events: PROVIDER_ACTIVATION_EVENTS,
};
