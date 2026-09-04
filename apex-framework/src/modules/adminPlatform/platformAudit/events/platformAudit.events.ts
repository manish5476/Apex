const eventBus = require('../../../../core/eventBus');

const PLATFORM_AUDIT_EVENTS = {
  CREATED: 'platformAudit.created',
  UPDATED: 'platformAudit.updated',
  DELETED: 'platformAudit.deleted',
};

function publishPlatformAuditCreated(entity) {
  eventBus.publish(PLATFORM_AUDIT_EVENTS.CREATED, { id: entity._id });
}

function publishPlatformAuditUpdated(entity) {
  eventBus.publish(PLATFORM_AUDIT_EVENTS.UPDATED, { id: entity._id });
}

function publishPlatformAuditDeleted(id) {
  eventBus.publish(PLATFORM_AUDIT_EVENTS.DELETED, { id });
}

module.exports = {
  PLATFORM_AUDIT_EVENTS,
  publishPlatformAuditCreated,
  publishPlatformAuditUpdated,
  publishPlatformAuditDeleted,
};
