const eventBus = require('../../../../../core/eventBus');

const PAYMENT_EVENTS = {
  CREATED: 'payment.created',
  UPDATED: 'payment.updated',
  DELETED: 'payment.deleted',
};

function publishPaymentCreated(entity) {
  eventBus.publish(PAYMENT_EVENTS.CREATED, { id: entity._id });
}

function publishPaymentUpdated(entity) {
  eventBus.publish(PAYMENT_EVENTS.UPDATED, { id: entity._id });
}

function publishPaymentDeleted(id) {
  eventBus.publish(PAYMENT_EVENTS.DELETED, { id });
}

module.exports = {
  PAYMENT_EVENTS,
  publishPaymentCreated,
  publishPaymentUpdated,
  publishPaymentDeleted,
};
