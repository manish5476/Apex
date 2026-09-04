const eventBus = require('../../../../../core/eventBus');

const SHIFT_EVENTS = {
  CREATED: 'shift.created',
  UPDATED: 'shift.updated',
  DELETED: 'shift.deleted',
};

function publishShiftCreated(entity) {
  eventBus.publish(SHIFT_EVENTS.CREATED, { id: entity._id });
}

function publishShiftUpdated(entity) {
  eventBus.publish(SHIFT_EVENTS.UPDATED, { id: entity._id });
}

function publishShiftDeleted(id) {
  eventBus.publish(SHIFT_EVENTS.DELETED, { id });
}

module.exports = {
  SHIFT_EVENTS,
  publishShiftCreated,
  publishShiftUpdated,
  publishShiftDeleted,
};
