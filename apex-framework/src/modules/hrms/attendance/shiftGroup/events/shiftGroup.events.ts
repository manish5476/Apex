const eventBus = require('../../../../../core/eventBus');

const SHIFT_GROUP_EVENTS = {
  CREATED: 'shiftGroup.created',
  UPDATED: 'shiftGroup.updated',
  DELETED: 'shiftGroup.deleted',
};

function publishShiftGroupCreated(entity) {
  eventBus.publish(SHIFT_GROUP_EVENTS.CREATED, { id: entity._id });
}

function publishShiftGroupUpdated(entity) {
  eventBus.publish(SHIFT_GROUP_EVENTS.UPDATED, { id: entity._id });
}

function publishShiftGroupDeleted(id) {
  eventBus.publish(SHIFT_GROUP_EVENTS.DELETED, { id });
}

module.exports = {
  SHIFT_GROUP_EVENTS,
  publishShiftGroupCreated,
  publishShiftGroupUpdated,
  publishShiftGroupDeleted,
};
