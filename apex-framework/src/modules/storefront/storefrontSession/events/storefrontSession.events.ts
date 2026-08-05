const eventBus = require('../../../../core/eventBus');

const STOREFRONT_SESSION_EVENTS = {
  CREATED: 'storefrontSession.created',
  UPDATED: 'storefrontSession.updated',
  DELETED: 'storefrontSession.deleted',
};

function publishStorefrontSessionCreated(entity) {
  eventBus.publish(STOREFRONT_SESSION_EVENTS.CREATED, { id: entity._id });
}

function publishStorefrontSessionUpdated(entity) {
  eventBus.publish(STOREFRONT_SESSION_EVENTS.UPDATED, { id: entity._id });
}

function publishStorefrontSessionDeleted(id) {
  eventBus.publish(STOREFRONT_SESSION_EVENTS.DELETED, { id });
}

module.exports = {
  STOREFRONT_SESSION_EVENTS,
  publishStorefrontSessionCreated,
  publishStorefrontSessionUpdated,
  publishStorefrontSessionDeleted,
};
