const eventBus = require('../../../../core/eventBus');

const SESSION_EVENTS = {
  CREATED: 'session.created',
  UPDATED: 'session.updated',
  DELETED: 'session.deleted',
};

function publishSessionCreated(entity) {
  eventBus.publish(SESSION_EVENTS.CREATED, { id: entity._id });
}

function publishSessionUpdated(entity) {
  eventBus.publish(SESSION_EVENTS.UPDATED, { id: entity._id });
}

function publishSessionDeleted(id) {
  eventBus.publish(SESSION_EVENTS.DELETED, { id });
}

module.exports = {
  SESSION_EVENTS,
  publishSessionCreated,
  publishSessionUpdated,
  publishSessionDeleted,
};
