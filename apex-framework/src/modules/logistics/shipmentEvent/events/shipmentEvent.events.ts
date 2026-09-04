const eventBus = require('../../../../core/eventBus');

const SHIPMENT_EVENT_EVENTS = {
  CREATED: 'shipmentEvent.created',
  UPDATED: 'shipmentEvent.updated',
  DELETED: 'shipmentEvent.deleted',
};

function publishShipmentEventCreated(entity) {
  eventBus.publish(SHIPMENT_EVENT_EVENTS.CREATED, { id: entity._id });
}

function publishShipmentEventUpdated(entity) {
  eventBus.publish(SHIPMENT_EVENT_EVENTS.UPDATED, { id: entity._id });
}

function publishShipmentEventDeleted(id) {
  eventBus.publish(SHIPMENT_EVENT_EVENTS.DELETED, { id });
}

module.exports = {
  SHIPMENT_EVENT_EVENTS,
  publishShipmentEventCreated,
  publishShipmentEventUpdated,
  publishShipmentEventDeleted,
};
