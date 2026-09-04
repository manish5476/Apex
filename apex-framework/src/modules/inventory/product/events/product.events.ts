const eventBus = require('../../../../core/eventBus');

const PRODUCT_EVENTS = {
  CREATED: 'product.created',
  UPDATED: 'product.updated',
  DELETED: 'product.deleted',
};

function publishProductCreated(entity) {
  eventBus.publish(PRODUCT_EVENTS.CREATED, { id: entity._id });
}

function publishProductUpdated(entity) {
  eventBus.publish(PRODUCT_EVENTS.UPDATED, { id: entity._id });
}

function publishProductDeleted(id) {
  eventBus.publish(PRODUCT_EVENTS.DELETED, { id });
}

module.exports = {
  PRODUCT_EVENTS,
  publishProductCreated,
  publishProductUpdated,
  publishProductDeleted,
};
