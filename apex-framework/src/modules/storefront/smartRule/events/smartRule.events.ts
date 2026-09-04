const eventBus = require('../../../../core/eventBus');

const SMART_RULE_EVENTS = {
  CREATED: 'smartRule.created',
  UPDATED: 'smartRule.updated',
  DELETED: 'smartRule.deleted',
};

function publishSmartRuleCreated(entity) {
  eventBus.publish(SMART_RULE_EVENTS.CREATED, { id: entity._id });
}

function publishSmartRuleUpdated(entity) {
  eventBus.publish(SMART_RULE_EVENTS.UPDATED, { id: entity._id });
}

function publishSmartRuleDeleted(id) {
  eventBus.publish(SMART_RULE_EVENTS.DELETED, { id });
}

module.exports = {
  SMART_RULE_EVENTS,
  publishSmartRuleCreated,
  publishSmartRuleUpdated,
  publishSmartRuleDeleted,
};
