const eventBus = require('../../../../../core/eventBus');

const LEAVE_REQUEST_EVENTS = {
  CREATED: 'leaveRequest.created',
  UPDATED: 'leaveRequest.updated',
  DELETED: 'leaveRequest.deleted',
};

function publishLeaveRequestCreated(entity) {
  eventBus.publish(LEAVE_REQUEST_EVENTS.CREATED, { id: entity._id });
}

function publishLeaveRequestUpdated(entity) {
  eventBus.publish(LEAVE_REQUEST_EVENTS.UPDATED, { id: entity._id });
}

function publishLeaveRequestDeleted(id) {
  eventBus.publish(LEAVE_REQUEST_EVENTS.DELETED, { id });
}

module.exports = {
  LEAVE_REQUEST_EVENTS,
  publishLeaveRequestCreated,
  publishLeaveRequestUpdated,
  publishLeaveRequestDeleted,
};
