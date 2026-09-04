const eventBus = require('../../../../../core/eventBus');

const EMI_EVENTS = {
  CREATED: 'emi.created',
  UPDATED: 'emi.updated',
  DELETED: 'emi.deleted',
};

function publishEmiCreated(entity) {
  eventBus.publish(EMI_EVENTS.CREATED, { id: entity._id });
}

function publishEmiUpdated(entity) {
  eventBus.publish(EMI_EVENTS.UPDATED, { id: entity._id });
}

function publishEmiDeleted(id) {
  eventBus.publish(EMI_EVENTS.DELETED, { id });
}

module.exports = {
  EMI_EVENTS,
  publishEmiCreated,
  publishEmiUpdated,
  publishEmiDeleted,
};
