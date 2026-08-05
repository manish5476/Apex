const eventBus = require('../../../../core/eventBus');

const PROVIDER_ACTIVATION_EVENTS = {
  CREATED: 'providerActivation.created',
  UPDATED: 'providerActivation.updated',
  DELETED: 'providerActivation.deleted',
};

function publishProviderActivationCreated(entity) {
  eventBus.publish(PROVIDER_ACTIVATION_EVENTS.CREATED, { id: entity._id });
}

function publishProviderActivationUpdated(entity) {
  eventBus.publish(PROVIDER_ACTIVATION_EVENTS.UPDATED, { id: entity._id });
}

function publishProviderActivationDeleted(id) {
  eventBus.publish(PROVIDER_ACTIVATION_EVENTS.DELETED, { id });
}

module.exports = {
  PROVIDER_ACTIVATION_EVENTS,
  publishProviderActivationCreated,
  publishProviderActivationUpdated,
  publishProviderActivationDeleted,
};
