const eventBus = require('../../../../../core/eventBus');

const GEO_FENCING_EVENTS = {
  CREATED: 'geoFencing.created',
  UPDATED: 'geoFencing.updated',
  DELETED: 'geoFencing.deleted',
};

function publishGeoFencingCreated(entity) {
  eventBus.publish(GEO_FENCING_EVENTS.CREATED, { id: entity._id });
}

function publishGeoFencingUpdated(entity) {
  eventBus.publish(GEO_FENCING_EVENTS.UPDATED, { id: entity._id });
}

function publishGeoFencingDeleted(id) {
  eventBus.publish(GEO_FENCING_EVENTS.DELETED, { id });
}

module.exports = {
  GEO_FENCING_EVENTS,
  publishGeoFencingCreated,
  publishGeoFencingUpdated,
  publishGeoFencingDeleted,
};
