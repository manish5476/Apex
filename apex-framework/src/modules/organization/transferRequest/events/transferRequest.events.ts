const eventBus = require('../../../../core/eventBus');

const TRANSFER_REQUEST_EVENTS = {
  CREATED: 'transferRequest.created',
  UPDATED: 'transferRequest.updated',
  DELETED: 'transferRequest.deleted',
};

function publishTransferRequestCreated(entity) {
  eventBus.publish(TRANSFER_REQUEST_EVENTS.CREATED, { id: entity._id });
}

function publishTransferRequestUpdated(entity) {
  eventBus.publish(TRANSFER_REQUEST_EVENTS.UPDATED, { id: entity._id });
}

function publishTransferRequestDeleted(id) {
  eventBus.publish(TRANSFER_REQUEST_EVENTS.DELETED, { id });
}

module.exports = {
  TRANSFER_REQUEST_EVENTS,
  publishTransferRequestCreated,
  publishTransferRequestUpdated,
  publishTransferRequestDeleted,
};
