const router = require('./api/routes/invoiceAudit.routes');
const invoiceAuditService = require('./application/services/invoiceAudit.service');
const { INVOICE_AUDIT_EVENTS } = require('./events/invoiceAudit.events');

module.exports = {
  router,
  service: invoiceAuditService,
  events: INVOICE_AUDIT_EVENTS,
};
