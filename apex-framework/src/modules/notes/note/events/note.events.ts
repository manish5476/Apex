const eventBus = require('../../../../core/eventBus');

const NOTE_EVENTS = {
  CREATED: 'note.created',
  UPDATED: 'note.updated',
  DELETED: 'note.deleted',
};

function publishNoteCreated(entity) {
  eventBus.publish(NOTE_EVENTS.CREATED, { id: entity._id });
}

function publishNoteUpdated(entity) {
  eventBus.publish(NOTE_EVENTS.UPDATED, { id: entity._id });
}

function publishNoteDeleted(id) {
  eventBus.publish(NOTE_EVENTS.DELETED, { id });
}

module.exports = {
  NOTE_EVENTS,
  publishNoteCreated,
  publishNoteUpdated,
  publishNoteDeleted,
};
