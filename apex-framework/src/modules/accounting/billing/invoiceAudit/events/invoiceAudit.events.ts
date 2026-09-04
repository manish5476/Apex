const eventBus = require('../../../../../core/eventBus');

const INVOICE_AUDIT_EVENTS = {
  CREATED: 'invoiceAudit.created',
  UPDATED: 'invoiceAudit.updated',
  DELETED: 'invoiceAudit.deleted',
};

function publishInvoiceAuditCreated(entity) {
  eventBus.publish(INVOICE_AUDIT_EVENTS.CREATED, { id: entity._id });
}

function publishInvoiceAuditUpdated(entity) {
  eventBus.publish(INVOICE_AUDIT_EVENTS.UPDATED, { id: entity._id });
}

function publishInvoiceAuditDeleted(id) {
  eventBus.publish(INVOICE_AUDIT_EVENTS.DELETED, { id });
}

module.exports = {
  INVOICE_AUDIT_EVENTS,
  publishInvoiceAuditCreated,
  publishInvoiceAuditUpdated,
  publishInvoiceAuditDeleted,
};
