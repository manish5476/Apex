const eventBus = require('../../../../../core/eventBus');

const LEAVE_BALANCE_EVENTS = {
  CREATED: 'leaveBalance.created',
  UPDATED: 'leaveBalance.updated',
  DELETED: 'leaveBalance.deleted',
};

function publishLeaveBalanceCreated(entity) {
  eventBus.publish(LEAVE_BALANCE_EVENTS.CREATED, { id: entity._id });
}

function publishLeaveBalanceUpdated(entity) {
  eventBus.publish(LEAVE_BALANCE_EVENTS.UPDATED, { id: entity._id });
}

function publishLeaveBalanceDeleted(id) {
  eventBus.publish(LEAVE_BALANCE_EVENTS.DELETED, { id });
}

module.exports = {
  LEAVE_BALANCE_EVENTS,
  publishLeaveBalanceCreated,
  publishLeaveBalanceUpdated,
  publishLeaveBalanceDeleted,
};
