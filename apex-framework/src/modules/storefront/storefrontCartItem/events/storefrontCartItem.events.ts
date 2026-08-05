const eventBus = require('../../../../core/eventBus');

const STOREFRONT_CART_ITEM_EVENTS = {
  CREATED: 'storefrontCartItem.created',
  UPDATED: 'storefrontCartItem.updated',
  DELETED: 'storefrontCartItem.deleted',
};

function publishStorefrontCartItemCreated(entity) {
  eventBus.publish(STOREFRONT_CART_ITEM_EVENTS.CREATED, { id: entity._id });
}

function publishStorefrontCartItemUpdated(entity) {
  eventBus.publish(STOREFRONT_CART_ITEM_EVENTS.UPDATED, { id: entity._id });
}

function publishStorefrontCartItemDeleted(id) {
  eventBus.publish(STOREFRONT_CART_ITEM_EVENTS.DELETED, { id });
}

module.exports = {
  STOREFRONT_CART_ITEM_EVENTS,
  publishStorefrontCartItemCreated,
  publishStorefrontCartItemUpdated,
  publishStorefrontCartItemDeleted,
};
