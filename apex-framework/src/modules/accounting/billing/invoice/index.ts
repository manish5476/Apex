const router = require('./api/routes/invoice.routes');
const invoiceService = require('./application/services/invoice.service');
const { INVOICE_EVENTS } = require('./events/invoice.events');

module.exports = {
  router,
  service: invoiceService,
  events: INVOICE_EVENTS,
};
