const eventBus = require('../../../../core/eventBus');

const CUSTOMER_EVENTS = {
  CREATED: 'customer.created',
  UPDATED: 'customer.updated',
  DELETED: 'customer.deleted',
};

function publishCustomerCreated(entity) {
  eventBus.publish(CUSTOMER_EVENTS.CREATED, { id: entity._id });
}

function publishCustomerUpdated(entity) {
  eventBus.publish(CUSTOMER_EVENTS.UPDATED, { id: entity._id });
}

function publishCustomerDeleted(id) {
  eventBus.publish(CUSTOMER_EVENTS.DELETED, { id });
}

module.exports = {
  CUSTOMER_EVENTS,
  publishCustomerCreated,
  publishCustomerUpdated,
  publishCustomerDeleted,
};
