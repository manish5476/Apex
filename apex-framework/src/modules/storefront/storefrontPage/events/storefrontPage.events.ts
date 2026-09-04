const eventBus = require('../../../../core/eventBus');

const STOREFRONT_PAGE_EVENTS = {
  CREATED: 'storefrontPage.created',
  UPDATED: 'storefrontPage.updated',
  DELETED: 'storefrontPage.deleted',
};

function publishStorefrontPageCreated(entity) {
  eventBus.publish(STOREFRONT_PAGE_EVENTS.CREATED, { id: entity._id });
}

function publishStorefrontPageUpdated(entity) {
  eventBus.publish(STOREFRONT_PAGE_EVENTS.UPDATED, { id: entity._id });
}

function publishStorefrontPageDeleted(id) {
  eventBus.publish(STOREFRONT_PAGE_EVENTS.DELETED, { id });
}

module.exports = {
  STOREFRONT_PAGE_EVENTS,
  publishStorefrontPageCreated,
  publishStorefrontPageUpdated,
  publishStorefrontPageDeleted,
};
