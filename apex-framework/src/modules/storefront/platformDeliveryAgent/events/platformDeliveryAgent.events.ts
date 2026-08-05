const eventBus = require('../../../../core/eventBus');

const PLATFORM_DELIVERY_AGENT_EVENTS = {
  CREATED: 'platformDeliveryAgent.created',
  UPDATED: 'platformDeliveryAgent.updated',
  DELETED: 'platformDeliveryAgent.deleted',
};

function publishPlatformDeliveryAgentCreated(entity) {
  eventBus.publish(PLATFORM_DELIVERY_AGENT_EVENTS.CREATED, { id: entity._id });
}

function publishPlatformDeliveryAgentUpdated(entity) {
  eventBus.publish(PLATFORM_DELIVERY_AGENT_EVENTS.UPDATED, { id: entity._id });
}

function publishPlatformDeliveryAgentDeleted(id) {
  eventBus.publish(PLATFORM_DELIVERY_AGENT_EVENTS.DELETED, { id });
}

module.exports = {
  PLATFORM_DELIVERY_AGENT_EVENTS,
  publishPlatformDeliveryAgentCreated,
  publishPlatformDeliveryAgentUpdated,
  publishPlatformDeliveryAgentDeleted,
};
