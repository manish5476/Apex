const eventBus = require('../../../../../core/eventBus');

const ACCOUNT_ENTRY_EVENTS = {
  CREATED: 'accountEntry.created',
  UPDATED: 'accountEntry.updated',
  DELETED: 'accountEntry.deleted',
};

function publishAccountEntryCreated(entity) {
  eventBus.publish(ACCOUNT_ENTRY_EVENTS.CREATED, { id: entity._id });
}

function publishAccountEntryUpdated(entity) {
  eventBus.publish(ACCOUNT_ENTRY_EVENTS.UPDATED, { id: entity._id });
}

function publishAccountEntryDeleted(id) {
  eventBus.publish(ACCOUNT_ENTRY_EVENTS.DELETED, { id });
}

module.exports = {
  ACCOUNT_ENTRY_EVENTS,
  publishAccountEntryCreated,
  publishAccountEntryUpdated,
  publishAccountEntryDeleted,
};
