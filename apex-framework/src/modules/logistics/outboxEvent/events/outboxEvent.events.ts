const eventBus = require('../../../../core/eventBus');

const OUTBOX_EVENT_EVENTS = {
  CREATED: 'outboxEvent.created',
  UPDATED: 'outboxEvent.updated',
  DELETED: 'outboxEvent.deleted',
};

function publishOutboxEventCreated(entity) {
  eventBus.publish(OUTBOX_EVENT_EVENTS.CREATED, { id: entity._id });
}

function publishOutboxEventUpdated(entity) {
  eventBus.publish(OUTBOX_EVENT_EVENTS.UPDATED, { id: entity._id });
}

function publishOutboxEventDeleted(id) {
  eventBus.publish(OUTBOX_EVENT_EVENTS.DELETED, { id });
}

module.exports = {
  OUTBOX_EVENT_EVENTS,
  publishOutboxEventCreated,
  publishOutboxEventUpdated,
  publishOutboxEventDeleted,
};
