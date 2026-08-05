const eventBus = require('../../../core/eventBus');

const FEED_EVENTS = {
  CREATED: 'feed.created',
  UPDATED: 'feed.updated',
  DELETED: 'feed.deleted',
};

function publishFeedCreated(entity) {
  eventBus.publish(FEED_EVENTS.CREATED, { id: entity._id });
}

function publishFeedUpdated(entity) {
  eventBus.publish(FEED_EVENTS.UPDATED, { id: entity._id });
}

function publishFeedDeleted(id) {
  eventBus.publish(FEED_EVENTS.DELETED, { id });
}

module.exports = {
  FEED_EVENTS,
  publishFeedCreated,
  publishFeedUpdated,
  publishFeedDeleted,
};
