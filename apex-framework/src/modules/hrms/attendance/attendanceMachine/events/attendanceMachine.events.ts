const eventBus = require('../../../../../core/eventBus');

const ATTENDANCE_MACHINE_EVENTS = {
  CREATED: 'attendanceMachine.created',
  UPDATED: 'attendanceMachine.updated',
  DELETED: 'attendanceMachine.deleted',
};

function publishAttendanceMachineCreated(entity) {
  eventBus.publish(ATTENDANCE_MACHINE_EVENTS.CREATED, { id: entity._id });
}

function publishAttendanceMachineUpdated(entity) {
  eventBus.publish(ATTENDANCE_MACHINE_EVENTS.UPDATED, { id: entity._id });
}

function publishAttendanceMachineDeleted(id) {
  eventBus.publish(ATTENDANCE_MACHINE_EVENTS.DELETED, { id });
}

module.exports = {
  ATTENDANCE_MACHINE_EVENTS,
  publishAttendanceMachineCreated,
  publishAttendanceMachineUpdated,
  publishAttendanceMachineDeleted,
};
