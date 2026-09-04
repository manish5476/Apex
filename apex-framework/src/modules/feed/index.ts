const router = require('./api/routes/feed.routes');
const feedService = require('./application/services/feed.service');
const { FEED_EVENTS } = require('./events/feed.events');

module.exports = {
  router,
  service: feedService,
  events: FEED_EVENTS,
};
