const eventBus = require('../../../../../core/eventBus');

const LEAVE_TRANSACTION_EVENTS = {
  CREATED: 'leaveTransaction.created',
  UPDATED: 'leaveTransaction.updated',
  DELETED: 'leaveTransaction.deleted',
};

function publishLeaveTransactionCreated(entity) {
  eventBus.publish(LEAVE_TRANSACTION_EVENTS.CREATED, { id: entity._id });
}

function publishLeaveTransactionUpdated(entity) {
  eventBus.publish(LEAVE_TRANSACTION_EVENTS.UPDATED, { id: entity._id });
}

function publishLeaveTransactionDeleted(id) {
  eventBus.publish(LEAVE_TRANSACTION_EVENTS.DELETED, { id });
}

module.exports = {
  LEAVE_TRANSACTION_EVENTS,
  publishLeaveTransactionCreated,
  publishLeaveTransactionUpdated,
  publishLeaveTransactionDeleted,
};
