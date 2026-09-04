const eventBus = require('../../../../core/eventBus');

const MASTER_RECORD_EVENTS = {
  CREATED: 'masterRecord.created',
  UPDATED: 'masterRecord.updated',
  DELETED: 'masterRecord.deleted',
};

function publishMasterRecordCreated(entity) {
  eventBus.publish(MASTER_RECORD_EVENTS.CREATED, { id: entity._id });
}

function publishMasterRecordUpdated(entity) {
  eventBus.publish(MASTER_RECORD_EVENTS.UPDATED, { id: entity._id });
}

function publishMasterRecordDeleted(id) {
  eventBus.publish(MASTER_RECORD_EVENTS.DELETED, { id });
}

module.exports = {
  MASTER_RECORD_EVENTS,
  publishMasterRecordCreated,
  publishMasterRecordUpdated,
  publishMasterRecordDeleted,
};
