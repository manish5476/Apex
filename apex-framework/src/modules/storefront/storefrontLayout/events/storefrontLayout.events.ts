const eventBus = require('../../../../core/eventBus');

const STOREFRONT_LAYOUT_EVENTS = {
  CREATED: 'storefrontLayout.created',
  UPDATED: 'storefrontLayout.updated',
  DELETED: 'storefrontLayout.deleted',
};

function publishStorefrontLayoutCreated(entity) {
  eventBus.publish(STOREFRONT_LAYOUT_EVENTS.CREATED, { id: entity._id });
}

function publishStorefrontLayoutUpdated(entity) {
  eventBus.publish(STOREFRONT_LAYOUT_EVENTS.UPDATED, { id: entity._id });
}

function publishStorefrontLayoutDeleted(id) {
  eventBus.publish(STOREFRONT_LAYOUT_EVENTS.DELETED, { id });
}

module.exports = {
  STOREFRONT_LAYOUT_EVENTS,
  publishStorefrontLayoutCreated,
  publishStorefrontLayoutUpdated,
  publishStorefrontLayoutDeleted,
};
