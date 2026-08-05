const eventBus = require('../../../../core/eventBus');

const STOCK_TRANSFER_EVENTS = {
  CREATED: 'stockTransfer.created',
  UPDATED: 'stockTransfer.updated',
  DELETED: 'stockTransfer.deleted',
};

function publishStockTransferCreated(entity) {
  eventBus.publish(STOCK_TRANSFER_EVENTS.CREATED, { id: entity._id });
}

function publishStockTransferUpdated(entity) {
  eventBus.publish(STOCK_TRANSFER_EVENTS.UPDATED, { id: entity._id });
}

function publishStockTransferDeleted(id) {
  eventBus.publish(STOCK_TRANSFER_EVENTS.DELETED, { id });
}

module.exports = {
  STOCK_TRANSFER_EVENTS,
  publishStockTransferCreated,
  publishStockTransferUpdated,
  publishStockTransferDeleted,
};
