const eventBus = require('../../../../core/eventBus');

const NOTE_ACTIVITY_EVENTS = {
  CREATED: 'noteActivity.created',
  UPDATED: 'noteActivity.updated',
  DELETED: 'noteActivity.deleted',
};

function publishNoteActivityCreated(entity) {
  eventBus.publish(NOTE_ACTIVITY_EVENTS.CREATED, { id: entity._id });
}

function publishNoteActivityUpdated(entity) {
  eventBus.publish(NOTE_ACTIVITY_EVENTS.UPDATED, { id: entity._id });
}

function publishNoteActivityDeleted(id) {
  eventBus.publish(NOTE_ACTIVITY_EVENTS.DELETED, { id });
}

module.exports = {
  NOTE_ACTIVITY_EVENTS,
  publishNoteActivityCreated,
  publishNoteActivityUpdated,
  publishNoteActivityDeleted,
};
