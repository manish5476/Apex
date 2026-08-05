const eventBus = require('../../../../core/eventBus');

const STOREFRONT_WISHLIST_EVENTS = {
  CREATED: 'storefrontWishlist.created',
  UPDATED: 'storefrontWishlist.updated',
  DELETED: 'storefrontWishlist.deleted',
};

function publishStorefrontWishlistCreated(entity) {
  eventBus.publish(STOREFRONT_WISHLIST_EVENTS.CREATED, { id: entity._id });
}

function publishStorefrontWishlistUpdated(entity) {
  eventBus.publish(STOREFRONT_WISHLIST_EVENTS.UPDATED, { id: entity._id });
}

function publishStorefrontWishlistDeleted(id) {
  eventBus.publish(STOREFRONT_WISHLIST_EVENTS.DELETED, { id });
}

module.exports = {
  STOREFRONT_WISHLIST_EVENTS,
  publishStorefrontWishlistCreated,
  publishStorefrontWishlistUpdated,
  publishStorefrontWishlistDeleted,
};
