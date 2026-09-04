const eventBus = require('../../../core/eventBus');

const ACTIVITY_EVENTS = {
  CREATED: 'activity.created',
  UPDATED: 'activity.updated',
  DELETED: 'activity.deleted',
};

function publishActivityCreated(entity) {
  eventBus.publish(ACTIVITY_EVENTS.CREATED, { id: entity._id });
}

function publishActivityUpdated(entity) {
  eventBus.publish(ACTIVITY_EVENTS.UPDATED, { id: entity._id });
}

function publishActivityDeleted(id) {
  eventBus.publish(ACTIVITY_EVENTS.DELETED, { id });
}

module.exports = {
  ACTIVITY_EVENTS,
  publishActivityCreated,
  publishActivityUpdated,
  publishActivityDeleted,
};
