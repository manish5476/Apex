const router = require('./api/routes/customer.routes');
const customerService = require('./application/services/customer.service');
const { CUSTOMER_EVENTS } = require('./events/customer.events');

module.exports = {
  router,
  service: customerService,
  events: CUSTOMER_EVENTS,
};
