const router = require('./api/routes/branch.routes');
const branchService = require('./application/services/branch.service');
const { BRANCH_EVENTS } = require('./events/branch.events');

module.exports = {
  router,
  service: branchService,
  events: BRANCH_EVENTS,
};
