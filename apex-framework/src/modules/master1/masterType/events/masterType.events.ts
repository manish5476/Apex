const eventBus = require('../../../../core/eventBus');

const MASTER_TYPE_EVENTS = {
  CREATED: 'masterType.created',
  UPDATED: 'masterType.updated',
  DELETED: 'masterType.deleted',
};

function publishMasterTypeCreated(entity) {
  eventBus.publish(MASTER_TYPE_EVENTS.CREATED, { id: entity._id });
}

function publishMasterTypeUpdated(entity) {
  eventBus.publish(MASTER_TYPE_EVENTS.UPDATED, { id: entity._id });
}

function publishMasterTypeDeleted(id) {
  eventBus.publish(MASTER_TYPE_EVENTS.DELETED, { id });
}

module.exports = {
  MASTER_TYPE_EVENTS,
  publishMasterTypeCreated,
  publishMasterTypeUpdated,
  publishMasterTypeDeleted,
};
