const router = require('./api/routes/department.routes');
const departmentService = require('./application/services/department.service');
const { DEPARTMENT_EVENTS } = require('./events/department.events');

module.exports = {
  router,
  service: departmentService,
  events: DEPARTMENT_EVENTS,
};
