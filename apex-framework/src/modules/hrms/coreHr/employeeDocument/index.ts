const router = require('./api/routes/employeeDocument.routes');
const employeeDocumentService = require('./application/services/employeeDocument.service');
const { EMPLOYEE_DOCUMENT_EVENTS } = require('./events/employeeDocument.events');

module.exports = {
  router,
  service: employeeDocumentService,
  events: EMPLOYEE_DOCUMENT_EVENTS,
};
