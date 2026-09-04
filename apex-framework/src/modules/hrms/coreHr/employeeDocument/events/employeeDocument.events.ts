const eventBus = require('../../../../../core/eventBus');

const EMPLOYEE_DOCUMENT_EVENTS = {
  CREATED: 'employeeDocument.created',
  UPDATED: 'employeeDocument.updated',
  DELETED: 'employeeDocument.deleted',
};

function publishEmployeeDocumentCreated(entity) {
  eventBus.publish(EMPLOYEE_DOCUMENT_EVENTS.CREATED, { id: entity._id });
}

function publishEmployeeDocumentUpdated(entity) {
  eventBus.publish(EMPLOYEE_DOCUMENT_EVENTS.UPDATED, { id: entity._id });
}

function publishEmployeeDocumentDeleted(id) {
  eventBus.publish(EMPLOYEE_DOCUMENT_EVENTS.DELETED, { id });
}

module.exports = {
  EMPLOYEE_DOCUMENT_EVENTS,
  publishEmployeeDocumentCreated,
  publishEmployeeDocumentUpdated,
  publishEmployeeDocumentDeleted,
};
