const eventBus = require('../../../../core/eventBus');

const STOREFRONT_ORDER_EVENTS = {
  CREATED: 'storefrontOrder.created',
  UPDATED: 'storefrontOrder.updated',
  DELETED: 'storefrontOrder.deleted',
};

function publishStorefrontOrderCreated(entity) {
  eventBus.publish(STOREFRONT_ORDER_EVENTS.CREATED, { id: entity._id });
}

function publishStorefrontOrderUpdated(entity) {
  eventBus.publish(STOREFRONT_ORDER_EVENTS.UPDATED, { id: entity._id });
}

function publishStorefrontOrderDeleted(id) {
  eventBus.publish(STOREFRONT_ORDER_EVENTS.DELETED, { id });
}

module.exports = {
  STOREFRONT_ORDER_EVENTS,
  publishStorefrontOrderCreated,
  publishStorefrontOrderUpdated,
  publishStorefrontOrderDeleted,
};
