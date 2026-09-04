const eventBus = require('../../../../core/eventBus');

const ORGANIZATION_PROFILE_EVENTS = {
  CREATED: 'organizationProfile.created',
  UPDATED: 'organizationProfile.updated',
  DELETED: 'organizationProfile.deleted',
};

function publishOrganizationProfileCreated(entity) {
  eventBus.publish(ORGANIZATION_PROFILE_EVENTS.CREATED, { id: entity._id });
}

function publishOrganizationProfileUpdated(entity) {
  eventBus.publish(ORGANIZATION_PROFILE_EVENTS.UPDATED, { id: entity._id });
}

function publishOrganizationProfileDeleted(id) {
  eventBus.publish(ORGANIZATION_PROFILE_EVENTS.DELETED, { id });
}

module.exports = {
  ORGANIZATION_PROFILE_EVENTS,
  publishOrganizationProfileCreated,
  publishOrganizationProfileUpdated,
  publishOrganizationProfileDeleted,
};
