const eventBus = require('../../../../core/eventBus');

const SHIPMENT_EVENTS = {
  CREATED: 'shipment.created',
  UPDATED: 'shipment.updated',
  DELETED: 'shipment.deleted',
};

function publishShipmentCreated(entity) {
  eventBus.publish(SHIPMENT_EVENTS.CREATED, { id: entity._id });
}

function publishShipmentUpdated(entity) {
  eventBus.publish(SHIPMENT_EVENTS.UPDATED, { id: entity._id });
}

function publishShipmentDeleted(id) {
  eventBus.publish(SHIPMENT_EVENTS.DELETED, { id });
}

module.exports = {
  SHIPMENT_EVENTS,
  publishShipmentCreated,
  publishShipmentUpdated,
  publishShipmentDeleted,
};
