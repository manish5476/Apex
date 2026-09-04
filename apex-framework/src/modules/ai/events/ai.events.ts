const eventBus = require('../../../core/eventBus');

const AI_EVENTS = {
  CREATED: 'ai.created',
  UPDATED: 'ai.updated',
  DELETED: 'ai.deleted',
};

function publishAiCreated(entity) {
  eventBus.publish(AI_EVENTS.CREATED, { id: entity._id });
}

function publishAiUpdated(entity) {
  eventBus.publish(AI_EVENTS.UPDATED, { id: entity._id });
}

function publishAiDeleted(id) {
  eventBus.publish(AI_EVENTS.DELETED, { id });
}

module.exports = {
  AI_EVENTS,
  publishAiCreated,
  publishAiUpdated,
  publishAiDeleted,
};
