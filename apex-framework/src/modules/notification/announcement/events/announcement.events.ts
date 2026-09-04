const eventBus = require('../../../../core/eventBus');

const ANNOUNCEMENT_EVENTS = {
  CREATED: 'announcement.created',
  UPDATED: 'announcement.updated',
  DELETED: 'announcement.deleted',
};

function publishAnnouncementCreated(entity) {
  eventBus.publish(ANNOUNCEMENT_EVENTS.CREATED, { id: entity._id });
}

function publishAnnouncementUpdated(entity) {
  eventBus.publish(ANNOUNCEMENT_EVENTS.UPDATED, { id: entity._id });
}

function publishAnnouncementDeleted(id) {
  eventBus.publish(ANNOUNCEMENT_EVENTS.DELETED, { id });
}

module.exports = {
  ANNOUNCEMENT_EVENTS,
  publishAnnouncementCreated,
  publishAnnouncementUpdated,
  publishAnnouncementDeleted,
};
