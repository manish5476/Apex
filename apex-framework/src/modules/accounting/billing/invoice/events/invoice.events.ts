const eventBus = require('../../../../../core/eventBus');

const INVOICE_EVENTS = {
  CREATED: 'invoice.created',
  UPDATED: 'invoice.updated',
  DELETED: 'invoice.deleted',
};

function publishInvoiceCreated(entity) {
  eventBus.publish(INVOICE_EVENTS.CREATED, { id: entity._id });
}

function publishInvoiceUpdated(entity) {
  eventBus.publish(INVOICE_EVENTS.UPDATED, { id: entity._id });
}

function publishInvoiceDeleted(id) {
  eventBus.publish(INVOICE_EVENTS.DELETED, { id });
}

module.exports = {
  INVOICE_EVENTS,
  publishInvoiceCreated,
  publishInvoiceUpdated,
  publishInvoiceDeleted,
};
