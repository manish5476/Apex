const router = require('./api/routes/storefrontCustomerAddress.routes');
const storefrontCustomerAddressService = require('./application/services/storefrontCustomerAddress.service');
const { STOREFRONT_CUSTOMER_ADDRESS_EVENTS } = require('./events/storefrontCustomerAddress.events');

module.exports = {
  router,
  service: storefrontCustomerAddressService,
  events: STOREFRONT_CUSTOMER_ADDRESS_EVENTS,
};
