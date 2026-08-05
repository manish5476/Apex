const eventBus = require('../../../../core/eventBus');

const STOREFRONT_DELIVERY_AGENT_EVENTS = {
  CREATED: 'storefrontDeliveryAgent.created',
  UPDATED: 'storefrontDeliveryAgent.updated',
  DELETED: 'storefrontDeliveryAgent.deleted',
};

function publishStorefrontDeliveryAgentCreated(entity) {
  eventBus.publish(STOREFRONT_DELIVERY_AGENT_EVENTS.CREATED, { id: entity._id });
}

function publishStorefrontDeliveryAgentUpdated(entity) {
  eventBus.publish(STOREFRONT_DELIVERY_AGENT_EVENTS.UPDATED, { id: entity._id });
}

function publishStorefrontDeliveryAgentDeleted(id) {
  eventBus.publish(STOREFRONT_DELIVERY_AGENT_EVENTS.DELETED, { id });
}

module.exports = {
  STOREFRONT_DELIVERY_AGENT_EVENTS,
  publishStorefrontDeliveryAgentCreated,
  publishStorefrontDeliveryAgentUpdated,
  publishStorefrontDeliveryAgentDeleted,
};
