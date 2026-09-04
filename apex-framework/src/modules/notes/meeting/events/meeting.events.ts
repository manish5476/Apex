const eventBus = require('../../../../core/eventBus');

const MEETING_EVENTS = {
  CREATED: 'meeting.created',
  UPDATED: 'meeting.updated',
  DELETED: 'meeting.deleted',
};

function publishMeetingCreated(entity) {
  eventBus.publish(MEETING_EVENTS.CREATED, { id: entity._id });
}

function publishMeetingUpdated(entity) {
  eventBus.publish(MEETING_EVENTS.UPDATED, { id: entity._id });
}

function publishMeetingDeleted(id) {
  eventBus.publish(MEETING_EVENTS.DELETED, { id });
}

module.exports = {
  MEETING_EVENTS,
  publishMeetingCreated,
  publishMeetingUpdated,
  publishMeetingDeleted,
};
