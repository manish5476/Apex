const eventBus = require('../../../../../core/eventBus');

const ATTENDANCE_LOG_EVENTS = {
  CREATED: 'attendanceLog.created',
  UPDATED: 'attendanceLog.updated',
  DELETED: 'attendanceLog.deleted',
};

function publishAttendanceLogCreated(entity) {
  eventBus.publish(ATTENDANCE_LOG_EVENTS.CREATED, { id: entity._id });
}

function publishAttendanceLogUpdated(entity) {
  eventBus.publish(ATTENDANCE_LOG_EVENTS.UPDATED, { id: entity._id });
}

function publishAttendanceLogDeleted(id) {
  eventBus.publish(ATTENDANCE_LOG_EVENTS.DELETED, { id });
}

module.exports = {
  ATTENDANCE_LOG_EVENTS,
  publishAttendanceLogCreated,
  publishAttendanceLogUpdated,
  publishAttendanceLogDeleted,
};
