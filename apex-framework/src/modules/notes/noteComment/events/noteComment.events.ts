const eventBus = require('../../../../core/eventBus');

const NOTE_COMMENT_EVENTS = {
  CREATED: 'noteComment.created',
  UPDATED: 'noteComment.updated',
  DELETED: 'noteComment.deleted',
};

function publishNoteCommentCreated(entity) {
  eventBus.publish(NOTE_COMMENT_EVENTS.CREATED, { id: entity._id });
}

function publishNoteCommentUpdated(entity) {
  eventBus.publish(NOTE_COMMENT_EVENTS.UPDATED, { id: entity._id });
}

function publishNoteCommentDeleted(id) {
  eventBus.publish(NOTE_COMMENT_EVENTS.DELETED, { id });
}

module.exports = {
  NOTE_COMMENT_EVENTS,
  publishNoteCommentCreated,
  publishNoteCommentUpdated,
  publishNoteCommentDeleted,
};
