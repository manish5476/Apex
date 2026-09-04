const eventBus = require('../../../../../core/eventBus');

const EXPENSE_CLAIM_EVENTS = {
  CREATED: 'expenseClaim.created',
  UPDATED: 'expenseClaim.updated',
  DELETED: 'expenseClaim.deleted',
};

function publishExpenseClaimCreated(entity) {
  eventBus.publish(EXPENSE_CLAIM_EVENTS.CREATED, { id: entity._id });
}

function publishExpenseClaimUpdated(entity) {
  eventBus.publish(EXPENSE_CLAIM_EVENTS.UPDATED, { id: entity._id });
}

function publishExpenseClaimDeleted(id) {
  eventBus.publish(EXPENSE_CLAIM_EVENTS.DELETED, { id });
}

module.exports = {
  EXPENSE_CLAIM_EVENTS,
  publishExpenseClaimCreated,
  publishExpenseClaimUpdated,
  publishExpenseClaimDeleted,
};
