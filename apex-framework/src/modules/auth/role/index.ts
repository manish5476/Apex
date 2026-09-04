const router = require('./api/routes/role.routes');
const roleService = require('./application/services/role.service');
const { ROLE_EVENTS } = require('./events/role.events');

module.exports = {
  router,
  service: roleService,
  events: ROLE_EVENTS,
};
