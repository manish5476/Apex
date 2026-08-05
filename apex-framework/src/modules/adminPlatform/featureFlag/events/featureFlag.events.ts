const eventBus = require('../../../../core/eventBus');

const FEATURE_FLAG_EVENTS = {
  CREATED: 'featureFlag.created',
  UPDATED: 'featureFlag.updated',
  DELETED: 'featureFlag.deleted',
};

function publishFeatureFlagCreated(entity) {
  eventBus.publish(FEATURE_FLAG_EVENTS.CREATED, { id: entity._id });
}

function publishFeatureFlagUpdated(entity) {
  eventBus.publish(FEATURE_FLAG_EVENTS.UPDATED, { id: entity._id });
}

function publishFeatureFlagDeleted(id) {
  eventBus.publish(FEATURE_FLAG_EVENTS.DELETED, { id });
}

module.exports = {
  FEATURE_FLAG_EVENTS,
  publishFeatureFlagCreated,
  publishFeatureFlagUpdated,
  publishFeatureFlagDeleted,
};
