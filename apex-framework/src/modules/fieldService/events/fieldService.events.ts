const eventBus = require('../../../core/eventBus');

const FIELD_SERVICE_EVENTS = {
  CREATED: 'fieldService.created',
  UPDATED: 'fieldService.updated',
  DELETED: 'fieldService.deleted',
};

function publishFieldServiceCreated(entity) {
  eventBus.publish(FIELD_SERVICE_EVENTS.CREATED, { id: entity._id });
}

function publishFieldServiceUpdated(entity) {
  eventBus.publish(FIELD_SERVICE_EVENTS.UPDATED, { id: entity._id });
}

function publishFieldServiceDeleted(id) {
  eventBus.publish(FIELD_SERVICE_EVENTS.DELETED, { id });
}

module.exports = {
  FIELD_SERVICE_EVENTS,
  publishFieldServiceCreated,
  publishFieldServiceUpdated,
  publishFieldServiceDeleted,
};
