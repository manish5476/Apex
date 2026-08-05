const router = require('./api/routes/salaryStructure.routes');
const salaryStructureService = require('./application/services/salaryStructure.service');
const { SALARY_STRUCTURE_EVENTS } = require('./events/salaryStructure.events');

module.exports = {
  router,
  service: salaryStructureService,
  events: SALARY_STRUCTURE_EVENTS,
};
