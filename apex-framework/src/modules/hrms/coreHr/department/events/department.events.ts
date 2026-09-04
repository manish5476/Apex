const eventBus = require('../../../../../core/eventBus');

const DEPARTMENT_EVENTS = {
  CREATED: 'department.created',
  UPDATED: 'department.updated',
  DELETED: 'department.deleted',
};

function publishDepartmentCreated(entity) {
  eventBus.publish(DEPARTMENT_EVENTS.CREATED, { id: entity._id });
}

function publishDepartmentUpdated(entity) {
  eventBus.publish(DEPARTMENT_EVENTS.UPDATED, { id: entity._id });
}

function publishDepartmentDeleted(id) {
  eventBus.publish(DEPARTMENT_EVENTS.DELETED, { id });
}

module.exports = {
  DEPARTMENT_EVENTS,
  publishDepartmentCreated,
  publishDepartmentUpdated,
  publishDepartmentDeleted,
};
