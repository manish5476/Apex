const eventBus = require('../../../../core/eventBus');

const SALES_RETURN_EVENTS = {
  CREATED: 'salesReturn.created',
  UPDATED: 'salesReturn.updated',
  DELETED: 'salesReturn.deleted',
};

function publishSalesReturnCreated(entity) {
  eventBus.publish(SALES_RETURN_EVENTS.CREATED, { id: entity._id });
}

function publishSalesReturnUpdated(entity) {
  eventBus.publish(SALES_RETURN_EVENTS.UPDATED, { id: entity._id });
}

function publishSalesReturnDeleted(id) {
  eventBus.publish(SALES_RETURN_EVENTS.DELETED, { id });
}

module.exports = {
  SALES_RETURN_EVENTS,
  publishSalesReturnCreated,
  publishSalesReturnUpdated,
  publishSalesReturnDeleted,
};
