const router = require('./api/routes/platformAudit.routes');
const platformAuditService = require('./application/services/platformAudit.service');
const { PLATFORM_AUDIT_EVENTS } = require('./events/platformAudit.events');

module.exports = {
  router,
  service: platformAuditService,
  events: PLATFORM_AUDIT_EVENTS,
};
