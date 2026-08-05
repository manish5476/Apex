const eventBus = require('../../../../core/eventBus');

const NOTIFICATION_CORE_EVENTS = {
  CREATED: 'notificationCore.created',
  UPDATED: 'notificationCore.updated',
  DELETED: 'notificationCore.deleted',
};

function publishNotificationCoreCreated(entity) {
  eventBus.publish(NOTIFICATION_CORE_EVENTS.CREATED, { id: entity._id });
}

function publishNotificationCoreUpdated(entity) {
  eventBus.publish(NOTIFICATION_CORE_EVENTS.UPDATED, { id: entity._id });
}

function publishNotificationCoreDeleted(id) {
  eventBus.publish(NOTIFICATION_CORE_EVENTS.DELETED, { id });
}

module.exports = {
  NOTIFICATION_CORE_EVENTS,
  publishNotificationCoreCreated,
  publishNotificationCoreUpdated,
  publishNotificationCoreDeleted,
};
