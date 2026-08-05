const eventBus = require('../../../core/eventBus');

const ANALYTICS_EVENTS = {
  CREATED: 'analytics.created',
  UPDATED: 'analytics.updated',
  DELETED: 'analytics.deleted',
};

function publishAnalyticsCreated(entity) {
  eventBus.publish(ANALYTICS_EVENTS.CREATED, { id: entity._id });
}

function publishAnalyticsUpdated(entity) {
  eventBus.publish(ANALYTICS_EVENTS.UPDATED, { id: entity._id });
}

function publishAnalyticsDeleted(id) {
  eventBus.publish(ANALYTICS_EVENTS.DELETED, { id });
}

module.exports = {
  ANALYTICS_EVENTS,
  publishAnalyticsCreated,
  publishAnalyticsUpdated,
  publishAnalyticsDeleted,
};
