const eventBus = require('../../../../core/eventBus');

const SHIPMENT_ASSIGNMENT_EVENTS = {
  CREATED: 'shipmentAssignment.created',
  UPDATED: 'shipmentAssignment.updated',
  DELETED: 'shipmentAssignment.deleted',
};

function publishShipmentAssignmentCreated(entity) {
  eventBus.publish(SHIPMENT_ASSIGNMENT_EVENTS.CREATED, { id: entity._id });
}

function publishShipmentAssignmentUpdated(entity) {
  eventBus.publish(SHIPMENT_ASSIGNMENT_EVENTS.UPDATED, { id: entity._id });
}

function publishShipmentAssignmentDeleted(id) {
  eventBus.publish(SHIPMENT_ASSIGNMENT_EVENTS.DELETED, { id });
}

module.exports = {
  SHIPMENT_ASSIGNMENT_EVENTS,
  publishShipmentAssignmentCreated,
  publishShipmentAssignmentUpdated,
  publishShipmentAssignmentDeleted,
};
