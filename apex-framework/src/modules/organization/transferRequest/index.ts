const router = require('./api/routes/transferRequest.routes');
const transferRequestService = require('./application/services/transferRequest.service');
const { TRANSFER_REQUEST_EVENTS } = require('./events/transferRequest.events');

module.exports = {
  router,
  service: transferRequestService,
  events: TRANSFER_REQUEST_EVENTS,
};
