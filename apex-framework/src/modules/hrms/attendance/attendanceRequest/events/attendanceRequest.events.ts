const eventBus = require('../../../../../core/eventBus');

const ATTENDANCE_REQUEST_EVENTS = {
  CREATED: 'attendanceRequest.created',
  UPDATED: 'attendanceRequest.updated',
  DELETED: 'attendanceRequest.deleted',
};

function publishAttendanceRequestCreated(entity) {
  eventBus.publish(ATTENDANCE_REQUEST_EVENTS.CREATED, { id: entity._id });
}

function publishAttendanceRequestUpdated(entity) {
  eventBus.publish(ATTENDANCE_REQUEST_EVENTS.UPDATED, { id: entity._id });
}

function publishAttendanceRequestDeleted(id) {
  eventBus.publish(ATTENDANCE_REQUEST_EVENTS.DELETED, { id });
}

module.exports = {
  ATTENDANCE_REQUEST_EVENTS,
  publishAttendanceRequestCreated,
  publishAttendanceRequestUpdated,
  publishAttendanceRequestDeleted,
};
