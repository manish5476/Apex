const eventBus = require('../../../../../core/eventBus');

const EMPLOYEE_EVENTS = {
  CREATED: 'employee.created',
  UPDATED: 'employee.updated',
  DELETED: 'employee.deleted',
};

function publishEmployeeCreated(entity) {
  eventBus.publish(EMPLOYEE_EVENTS.CREATED, { id: entity._id });
}

function publishEmployeeUpdated(entity) {
  eventBus.publish(EMPLOYEE_EVENTS.UPDATED, { id: entity._id });
}

function publishEmployeeDeleted(id) {
  eventBus.publish(EMPLOYEE_EVENTS.DELETED, { id });
}

module.exports = {
  EMPLOYEE_EVENTS,
  publishEmployeeCreated,
  publishEmployeeUpdated,
  publishEmployeeDeleted,
};
