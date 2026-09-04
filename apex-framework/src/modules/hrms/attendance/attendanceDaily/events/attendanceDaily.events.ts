const eventBus = require('../../../../../core/eventBus');

const ATTENDANCE_DAILY_EVENTS = {
  CREATED: 'attendanceDaily.created',
  UPDATED: 'attendanceDaily.updated',
  DELETED: 'attendanceDaily.deleted',
};

function publishAttendanceDailyCreated(entity) {
  eventBus.publish(ATTENDANCE_DAILY_EVENTS.CREATED, { id: entity._id });
}

function publishAttendanceDailyUpdated(entity) {
  eventBus.publish(ATTENDANCE_DAILY_EVENTS.UPDATED, { id: entity._id });
}

function publishAttendanceDailyDeleted(id) {
  eventBus.publish(ATTENDANCE_DAILY_EVENTS.DELETED, { id });
}

module.exports = {
  ATTENDANCE_DAILY_EVENTS,
  publishAttendanceDailyCreated,
  publishAttendanceDailyUpdated,
  publishAttendanceDailyDeleted,
};
