const eventBus = require('../../../../core/eventBus');

const SHIPMENT_ACTIVITY_EVENTS = {
  CREATED: 'shipmentActivity.created',
  UPDATED: 'shipmentActivity.updated',
  DELETED: 'shipmentActivity.deleted',
};

function publishShipmentActivityCreated(entity) {
  eventBus.publish(SHIPMENT_ACTIVITY_EVENTS.CREATED, { id: entity._id });
}

function publishShipmentActivityUpdated(entity) {
  eventBus.publish(SHIPMENT_ACTIVITY_EVENTS.UPDATED, { id: entity._id });
}

function publishShipmentActivityDeleted(id) {
  eventBus.publish(SHIPMENT_ACTIVITY_EVENTS.DELETED, { id });
}

module.exports = {
  SHIPMENT_ACTIVITY_EVENTS,
  publishShipmentActivityCreated,
  publishShipmentActivityUpdated,
  publishShipmentActivityDeleted,
};
