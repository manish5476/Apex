const eventBus = require('../../../../../core/eventBus');

const ATTENDANCE_SUMMARY_EVENTS = {
  CREATED: 'attendanceSummary.created',
  UPDATED: 'attendanceSummary.updated',
  DELETED: 'attendanceSummary.deleted',
};

function publishAttendanceSummaryCreated(entity) {
  eventBus.publish(ATTENDANCE_SUMMARY_EVENTS.CREATED, { id: entity._id });
}

function publishAttendanceSummaryUpdated(entity) {
  eventBus.publish(ATTENDANCE_SUMMARY_EVENTS.UPDATED, { id: entity._id });
}

function publishAttendanceSummaryDeleted(id) {
  eventBus.publish(ATTENDANCE_SUMMARY_EVENTS.DELETED, { id });
}

module.exports = {
  ATTENDANCE_SUMMARY_EVENTS,
  publishAttendanceSummaryCreated,
  publishAttendanceSummaryUpdated,
  publishAttendanceSummaryDeleted,
};
