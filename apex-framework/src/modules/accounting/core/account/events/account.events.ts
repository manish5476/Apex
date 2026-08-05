const eventBus = require('../../../../../core/eventBus');

const ACCOUNT_EVENTS = {
  CREATED: 'account.created',
  UPDATED: 'account.updated',
  DELETED: 'account.deleted',
};

function publishAccountCreated(entity) {
  eventBus.publish(ACCOUNT_EVENTS.CREATED, { id: entity._id });
}

function publishAccountUpdated(entity) {
  eventBus.publish(ACCOUNT_EVENTS.UPDATED, { id: entity._id });
}

function publishAccountDeleted(id) {
  eventBus.publish(ACCOUNT_EVENTS.DELETED, { id });
}

module.exports = {
  ACCOUNT_EVENTS,
  publishAccountCreated,
  publishAccountUpdated,
  publishAccountDeleted,
};
