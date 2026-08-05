const eventBus = require('../../../../core/eventBus');

const STOREFRONT_CUSTOMER_EVENTS = {
  CREATED: 'storefrontCustomer.created',
  UPDATED: 'storefrontCustomer.updated',
  DELETED: 'storefrontCustomer.deleted',
};

function publishStorefrontCustomerCreated(entity) {
  eventBus.publish(STOREFRONT_CUSTOMER_EVENTS.CREATED, { id: entity._id });
}

function publishStorefrontCustomerUpdated(entity) {
  eventBus.publish(STOREFRONT_CUSTOMER_EVENTS.UPDATED, { id: entity._id });
}

function publishStorefrontCustomerDeleted(id) {
  eventBus.publish(STOREFRONT_CUSTOMER_EVENTS.DELETED, { id });
}

module.exports = {
  STOREFRONT_CUSTOMER_EVENTS,
  publishStorefrontCustomerCreated,
  publishStorefrontCustomerUpdated,
  publishStorefrontCustomerDeleted,
};
