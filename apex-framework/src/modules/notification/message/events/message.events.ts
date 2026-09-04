const eventBus = require('../../../../core/eventBus');

const MESSAGE_EVENTS = {
  CREATED: 'message.created',
  UPDATED: 'message.updated',
  DELETED: 'message.deleted',
};

function publishMessageCreated(entity) {
  eventBus.publish(MESSAGE_EVENTS.CREATED, { id: entity._id });
}

function publishMessageUpdated(entity) {
  eventBus.publish(MESSAGE_EVENTS.UPDATED, { id: entity._id });
}

function publishMessageDeleted(id) {
  eventBus.publish(MESSAGE_EVENTS.DELETED, { id });
}

module.exports = {
  MESSAGE_EVENTS,
  publishMessageCreated,
  publishMessageUpdated,
  publishMessageDeleted,
};
