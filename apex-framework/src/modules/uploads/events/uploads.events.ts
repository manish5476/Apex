const eventBus = require('../../../core/eventBus');

const UPLOADS_EVENTS = {
  CREATED: 'uploads.created',
  UPDATED: 'uploads.updated',
  DELETED: 'uploads.deleted',
};

function publishUploadsCreated(entity) {
  eventBus.publish(UPLOADS_EVENTS.CREATED, { id: entity._id });
}

function publishUploadsUpdated(entity) {
  eventBus.publish(UPLOADS_EVENTS.UPDATED, { id: entity._id });
}

function publishUploadsDeleted(id) {
  eventBus.publish(UPLOADS_EVENTS.DELETED, { id });
}

module.exports = {
  UPLOADS_EVENTS,
  publishUploadsCreated,
  publishUploadsUpdated,
  publishUploadsDeleted,
};
