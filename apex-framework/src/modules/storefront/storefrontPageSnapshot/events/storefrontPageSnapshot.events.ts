const eventBus = require('../../../../core/eventBus');

const STOREFRONT_PAGE_SNAPSHOT_EVENTS = {
  CREATED: 'storefrontPageSnapshot.created',
  UPDATED: 'storefrontPageSnapshot.updated',
  DELETED: 'storefrontPageSnapshot.deleted',
};

function publishStorefrontPageSnapshotCreated(entity) {
  eventBus.publish(STOREFRONT_PAGE_SNAPSHOT_EVENTS.CREATED, { id: entity._id });
}

function publishStorefrontPageSnapshotUpdated(entity) {
  eventBus.publish(STOREFRONT_PAGE_SNAPSHOT_EVENTS.UPDATED, { id: entity._id });
}

function publishStorefrontPageSnapshotDeleted(id) {
  eventBus.publish(STOREFRONT_PAGE_SNAPSHOT_EVENTS.DELETED, { id });
}

module.exports = {
  STOREFRONT_PAGE_SNAPSHOT_EVENTS,
  publishStorefrontPageSnapshotCreated,
  publishStorefrontPageSnapshotUpdated,
  publishStorefrontPageSnapshotDeleted,
};
