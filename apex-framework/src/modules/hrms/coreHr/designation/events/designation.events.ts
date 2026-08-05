const eventBus = require('../../../../../core/eventBus');

const DESIGNATION_EVENTS = {
  CREATED: 'designation.created',
  UPDATED: 'designation.updated',
  DELETED: 'designation.deleted',
};

function publishDesignationCreated(entity) {
  eventBus.publish(DESIGNATION_EVENTS.CREATED, { id: entity._id });
}

function publishDesignationUpdated(entity) {
  eventBus.publish(DESIGNATION_EVENTS.UPDATED, { id: entity._id });
}

function publishDesignationDeleted(id) {
  eventBus.publish(DESIGNATION_EVENTS.DELETED, { id });
}

module.exports = {
  DESIGNATION_EVENTS,
  publishDesignationCreated,
  publishDesignationUpdated,
  publishDesignationDeleted,
};
