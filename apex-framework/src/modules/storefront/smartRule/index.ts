const router = require('./api/routes/smartRule.routes');
const smartRuleService = require('./application/services/smartRule.service');
const { SMART_RULE_EVENTS } = require('./events/smartRule.events');

module.exports = {
  router,
  service: smartRuleService,
  events: SMART_RULE_EVENTS,
};
