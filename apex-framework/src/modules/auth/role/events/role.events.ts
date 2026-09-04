const eventBus = require('../../../../core/eventBus');

const ROLE_EVENTS = {
  CREATED: 'role.created',
  UPDATED: 'role.updated',
  DELETED: 'role.deleted',
};

function publishRoleCreated(entity) {
  eventBus.publish(ROLE_EVENTS.CREATED, { id: entity._id });
}

function publishRoleUpdated(entity) {
  eventBus.publish(ROLE_EVENTS.UPDATED, { id: entity._id });
}

function publishRoleDeleted(id) {
  eventBus.publish(ROLE_EVENTS.DELETED, { id });
}

module.exports = {
  ROLE_EVENTS,
  publishRoleCreated,
  publishRoleUpdated,
  publishRoleDeleted,
};
