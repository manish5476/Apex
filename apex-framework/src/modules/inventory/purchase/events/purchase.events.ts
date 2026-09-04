const eventBus = require('../../../../core/eventBus');

const PURCHASE_EVENTS = {
  CREATED: 'purchase.created',
  UPDATED: 'purchase.updated',
  DELETED: 'purchase.deleted',
};

function publishPurchaseCreated(entity) {
  eventBus.publish(PURCHASE_EVENTS.CREATED, { id: entity._id });
}

function publishPurchaseUpdated(entity) {
  eventBus.publish(PURCHASE_EVENTS.UPDATED, { id: entity._id });
}

function publishPurchaseDeleted(id) {
  eventBus.publish(PURCHASE_EVENTS.DELETED, { id });
}

module.exports = {
  PURCHASE_EVENTS,
  publishPurchaseCreated,
  publishPurchaseUpdated,
  publishPurchaseDeleted,
};
