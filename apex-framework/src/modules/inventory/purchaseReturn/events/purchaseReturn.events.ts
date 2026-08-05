const eventBus = require('../../../../core/eventBus');

const PURCHASE_RETURN_EVENTS = {
  CREATED: 'purchaseReturn.created',
  UPDATED: 'purchaseReturn.updated',
  DELETED: 'purchaseReturn.deleted',
};

function publishPurchaseReturnCreated(entity) {
  eventBus.publish(PURCHASE_RETURN_EVENTS.CREATED, { id: entity._id });
}

function publishPurchaseReturnUpdated(entity) {
  eventBus.publish(PURCHASE_RETURN_EVENTS.UPDATED, { id: entity._id });
}

function publishPurchaseReturnDeleted(id) {
  eventBus.publish(PURCHASE_RETURN_EVENTS.DELETED, { id });
}

module.exports = {
  PURCHASE_RETURN_EVENTS,
  publishPurchaseReturnCreated,
  publishPurchaseReturnUpdated,
  publishPurchaseReturnDeleted,
};
