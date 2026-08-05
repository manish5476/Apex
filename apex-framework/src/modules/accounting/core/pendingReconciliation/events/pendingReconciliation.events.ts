const eventBus = require('../../../../../core/eventBus');

const PENDING_RECONCILIATION_EVENTS = {
  CREATED: 'pendingReconciliation.created',
  UPDATED: 'pendingReconciliation.updated',
  DELETED: 'pendingReconciliation.deleted',
};

function publishPendingReconciliationCreated(entity) {
  eventBus.publish(PENDING_RECONCILIATION_EVENTS.CREATED, { id: entity._id });
}

function publishPendingReconciliationUpdated(entity) {
  eventBus.publish(PENDING_RECONCILIATION_EVENTS.UPDATED, { id: entity._id });
}

function publishPendingReconciliationDeleted(id) {
  eventBus.publish(PENDING_RECONCILIATION_EVENTS.DELETED, { id });
}

module.exports = {
  PENDING_RECONCILIATION_EVENTS,
  publishPendingReconciliationCreated,
  publishPendingReconciliationUpdated,
  publishPendingReconciliationDeleted,
};
