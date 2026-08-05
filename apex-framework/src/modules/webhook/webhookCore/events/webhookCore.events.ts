const eventBus = require('../../../../core/eventBus');

const WEBHOOK_CORE_EVENTS = {
  CREATED: 'webhookCore.created',
  UPDATED: 'webhookCore.updated',
  DELETED: 'webhookCore.deleted',
};

function publishWebhookCoreCreated(entity) {
  eventBus.publish(WEBHOOK_CORE_EVENTS.CREATED, { id: entity._id });
}

function publishWebhookCoreUpdated(entity) {
  eventBus.publish(WEBHOOK_CORE_EVENTS.UPDATED, { id: entity._id });
}

function publishWebhookCoreDeleted(id) {
  eventBus.publish(WEBHOOK_CORE_EVENTS.DELETED, { id });
}

module.exports = {
  WEBHOOK_CORE_EVENTS,
  publishWebhookCoreCreated,
  publishWebhookCoreUpdated,
  publishWebhookCoreDeleted,
};
