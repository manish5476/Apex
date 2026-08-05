const router = require('./api/routes/storefrontPageSnapshot.routes');
const storefrontPageSnapshotService = require('./application/services/storefrontPageSnapshot.service');
const { STOREFRONT_PAGE_SNAPSHOT_EVENTS } = require('./events/storefrontPageSnapshot.events');

module.exports = {
  router,
  service: storefrontPageSnapshotService,
  events: STOREFRONT_PAGE_SNAPSHOT_EVENTS,
};
