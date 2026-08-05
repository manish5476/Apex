const eventBus = require('../../../../core/eventBus');

const CHANNEL_EVENTS = {
  CREATED: 'channel.created',
  UPDATED: 'channel.updated',
  DELETED: 'channel.deleted',
};

function publishChannelCreated(entity) {
  eventBus.publish(CHANNEL_EVENTS.CREATED, { id: entity._id });
}

function publishChannelUpdated(entity) {
  eventBus.publish(CHANNEL_EVENTS.UPDATED, { id: entity._id });
}

function publishChannelDeleted(id) {
  eventBus.publish(CHANNEL_EVENTS.DELETED, { id });
}

module.exports = {
  CHANNEL_EVENTS,
  publishChannelCreated,
  publishChannelUpdated,
  publishChannelDeleted,
};
