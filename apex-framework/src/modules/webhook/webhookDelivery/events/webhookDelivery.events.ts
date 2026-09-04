const eventBus = require('../../../../core/eventBus');

const WEBHOOK_DELIVERY_EVENTS = {
  CREATED: 'webhookDelivery.created',
  UPDATED: 'webhookDelivery.updated',
  DELETED: 'webhookDelivery.deleted',
};

function publishWebhookDeliveryCreated(entity) {
  eventBus.publish(WEBHOOK_DELIVERY_EVENTS.CREATED, { id: entity._id });
}

function publishWebhookDeliveryUpdated(entity) {
  eventBus.publish(WEBHOOK_DELIVERY_EVENTS.UPDATED, { id: entity._id });
}

function publishWebhookDeliveryDeleted(id) {
  eventBus.publish(WEBHOOK_DELIVERY_EVENTS.DELETED, { id });
}

module.exports = {
  WEBHOOK_DELIVERY_EVENTS,
  publishWebhookDeliveryCreated,
  publishWebhookDeliveryUpdated,
  publishWebhookDeliveryDeleted,
};
