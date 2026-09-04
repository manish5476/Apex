const router = require('./api/routes/storefrontPage.routes');
const storefrontPageService = require('./application/services/storefrontPage.service');
const { STOREFRONT_PAGE_EVENTS } = require('./events/storefrontPage.events');

module.exports = {
  router,
  service: storefrontPageService,
  events: STOREFRONT_PAGE_EVENTS,
};
