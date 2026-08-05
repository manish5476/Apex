const eventBus = require('../../../../core/eventBus');

const SALES_EVENTS = {
  CREATED: 'sales.created',
  UPDATED: 'sales.updated',
  DELETED: 'sales.deleted',
};

function publishSalesCreated(entity) {
  eventBus.publish(SALES_EVENTS.CREATED, { id: entity._id });
}

function publishSalesUpdated(entity) {
  eventBus.publish(SALES_EVENTS.UPDATED, { id: entity._id });
}

function publishSalesDeleted(id) {
  eventBus.publish(SALES_EVENTS.DELETED, { id });
}

module.exports = {
  SALES_EVENTS,
  publishSalesCreated,
  publishSalesUpdated,
  publishSalesDeleted,
};
