const eventBus = require('../../../../../core/eventBus');

const FEEDBACK_EVENTS = {
  CREATED: 'feedback.created',
  UPDATED: 'feedback.updated',
  DELETED: 'feedback.deleted',
};

function publishFeedbackCreated(entity) {
  eventBus.publish(FEEDBACK_EVENTS.CREATED, { id: entity._id });
}

function publishFeedbackUpdated(entity) {
  eventBus.publish(FEEDBACK_EVENTS.UPDATED, { id: entity._id });
}

function publishFeedbackDeleted(id) {
  eventBus.publish(FEEDBACK_EVENTS.DELETED, { id });
}

module.exports = {
  FEEDBACK_EVENTS,
  publishFeedbackCreated,
  publishFeedbackUpdated,
  publishFeedbackDeleted,
};
