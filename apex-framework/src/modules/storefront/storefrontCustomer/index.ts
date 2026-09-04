const router = require('./api/routes/storefrontCustomer.routes');
const storefrontCustomerService = require('./application/services/storefrontCustomer.service');
const { STOREFRONT_CUSTOMER_EVENTS } = require('./events/storefrontCustomer.events');

module.exports = {
  router,
  service: storefrontCustomerService,
  events: STOREFRONT_CUSTOMER_EVENTS,
};
