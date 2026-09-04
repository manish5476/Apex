const router = require('./api/routes/storefrontLayout.routes');
const storefrontLayoutService = require('./application/services/storefrontLayout.service');
const { STOREFRONT_LAYOUT_EVENTS } = require('./events/storefrontLayout.events');

module.exports = {
  router,
  service: storefrontLayoutService,
  events: STOREFRONT_LAYOUT_EVENTS,
};
