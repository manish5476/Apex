const eventBus = require('../../../../core/eventBus');

const USER_EVENTS = {
  CREATED: 'user.created',
  UPDATED: 'user.updated',
  DELETED: 'user.deleted',
};

function publishUserCreated(entity) {
  eventBus.publish(USER_EVENTS.CREATED, { id: entity._id });
}

function publishUserUpdated(entity) {
  eventBus.publish(USER_EVENTS.UPDATED, { id: entity._id });
}

function publishUserDeleted(id) {
  eventBus.publish(USER_EVENTS.DELETED, { id });
}

module.exports = {
  USER_EVENTS,
  publishUserCreated,
  publishUserUpdated,
  publishUserDeleted,
};
