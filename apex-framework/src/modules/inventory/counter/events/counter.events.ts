const eventBus = require('../../../../core/eventBus');

const COUNTER_EVENTS = {
  CREATED: 'counter.created',
  UPDATED: 'counter.updated',
  DELETED: 'counter.deleted',
};

function publishCounterCreated(entity) {
  eventBus.publish(COUNTER_EVENTS.CREATED, { id: entity._id });
}

function publishCounterUpdated(entity) {
  eventBus.publish(COUNTER_EVENTS.UPDATED, { id: entity._id });
}

function publishCounterDeleted(id) {
  eventBus.publish(COUNTER_EVENTS.DELETED, { id });
}

module.exports = {
  COUNTER_EVENTS,
  publishCounterCreated,
  publishCounterUpdated,
  publishCounterDeleted,
};
