const router = require('./api/routes/employee.routes');
const employeeService = require('./application/services/employee.service');
const { EMPLOYEE_EVENTS } = require('./events/employee.events');

module.exports = {
  router,
  service: employeeService,
  events: EMPLOYEE_EVENTS,
};
