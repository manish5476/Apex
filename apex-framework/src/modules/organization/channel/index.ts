const router = require('./api/routes/channel.routes');
const channelService = require('./application/services/channel.service');
const { CHANNEL_EVENTS } = require('./events/channel.events');

module.exports = {
  router,
  service: channelService,
  events: CHANNEL_EVENTS,
};
