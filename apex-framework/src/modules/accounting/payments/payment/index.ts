const router = require('./api/routes/payment.routes');
const paymentService = require('./application/services/payment.service');
const { PAYMENT_EVENTS } = require('./events/payment.events');

module.exports = {
  router,
  service: paymentService,
  events: PAYMENT_EVENTS,
};
