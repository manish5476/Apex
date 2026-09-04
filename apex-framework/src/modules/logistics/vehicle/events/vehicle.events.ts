const eventBus = require('../../../../core/eventBus');

const VEHICLE_EVENTS = {
  CREATED: 'vehicle.created',
  UPDATED: 'vehicle.updated',
  DELETED: 'vehicle.deleted',
};

function publishVehicleCreated(entity) {
  eventBus.publish(VEHICLE_EVENTS.CREATED, { id: entity._id });
}

function publishVehicleUpdated(entity) {
  eventBus.publish(VEHICLE_EVENTS.UPDATED, { id: entity._id });
}

function publishVehicleDeleted(id) {
  eventBus.publish(VEHICLE_EVENTS.DELETED, { id });
}

module.exports = {
  VEHICLE_EVENTS,
  publishVehicleCreated,
  publishVehicleUpdated,
  publishVehicleDeleted,
};
