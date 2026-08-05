const eventBus = require('../../../../core/eventBus');

const STOREFRONT_CART_EVENTS = {
  CREATED: 'storefrontCart.created',
  UPDATED: 'storefrontCart.updated',
  DELETED: 'storefrontCart.deleted',
};

function publishStorefrontCartCreated(entity) {
  eventBus.publish(STOREFRONT_CART_EVENTS.CREATED, { id: entity._id });
}

function publishStorefrontCartUpdated(entity) {
  eventBus.publish(STOREFRONT_CART_EVENTS.UPDATED, { id: entity._id });
}

function publishStorefrontCartDeleted(id) {
  eventBus.publish(STOREFRONT_CART_EVENTS.DELETED, { id });
}

module.exports = {
  STOREFRONT_CART_EVENTS,
  publishStorefrontCartCreated,
  publishStorefrontCartUpdated,
  publishStorefrontCartDeleted,
};
