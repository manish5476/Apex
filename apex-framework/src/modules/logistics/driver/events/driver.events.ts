const eventBus = require('../../../../core/eventBus');

const DRIVER_EVENTS = {
  CREATED: 'driver.created',
  UPDATED: 'driver.updated',
  DELETED: 'driver.deleted',
};

function publishDriverCreated(entity) {
  eventBus.publish(DRIVER_EVENTS.CREATED, { id: entity._id });
}

function publishDriverUpdated(entity) {
  eventBus.publish(DRIVER_EVENTS.UPDATED, { id: entity._id });
}

function publishDriverDeleted(id) {
  eventBus.publish(DRIVER_EVENTS.DELETED, { id });
}

module.exports = {
  DRIVER_EVENTS,
  publishDriverCreated,
  publishDriverUpdated,
  publishDriverDeleted,
};
