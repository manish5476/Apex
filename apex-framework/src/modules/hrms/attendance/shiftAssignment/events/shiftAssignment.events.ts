const eventBus = require('../../../../../core/eventBus');

const SHIFT_ASSIGNMENT_EVENTS = {
  CREATED: 'shiftAssignment.created',
  UPDATED: 'shiftAssignment.updated',
  DELETED: 'shiftAssignment.deleted',
};

function publishShiftAssignmentCreated(entity) {
  eventBus.publish(SHIFT_ASSIGNMENT_EVENTS.CREATED, { id: entity._id });
}

function publishShiftAssignmentUpdated(entity) {
  eventBus.publish(SHIFT_ASSIGNMENT_EVENTS.UPDATED, { id: entity._id });
}

function publishShiftAssignmentDeleted(id) {
  eventBus.publish(SHIFT_ASSIGNMENT_EVENTS.DELETED, { id });
}

module.exports = {
  SHIFT_ASSIGNMENT_EVENTS,
  publishShiftAssignmentCreated,
  publishShiftAssignmentUpdated,
  publishShiftAssignmentDeleted,
};
