const eventBus = require('../../../../core/eventBus');

const STOREFRONT_CUSTOMER_ADDRESS_EVENTS = {
  CREATED: 'storefrontCustomerAddress.created',
  UPDATED: 'storefrontCustomerAddress.updated',
  DELETED: 'storefrontCustomerAddress.deleted',
};

function publishStorefrontCustomerAddressCreated(entity) {
  eventBus.publish(STOREFRONT_CUSTOMER_ADDRESS_EVENTS.CREATED, { id: entity._id });
}

function publishStorefrontCustomerAddressUpdated(entity) {
  eventBus.publish(STOREFRONT_CUSTOMER_ADDRESS_EVENTS.UPDATED, { id: entity._id });
}

function publishStorefrontCustomerAddressDeleted(id) {
  eventBus.publish(STOREFRONT_CUSTOMER_ADDRESS_EVENTS.DELETED, { id });
}

module.exports = {
  STOREFRONT_CUSTOMER_ADDRESS_EVENTS,
  publishStorefrontCustomerAddressCreated,
  publishStorefrontCustomerAddressUpdated,
  publishStorefrontCustomerAddressDeleted,
};
