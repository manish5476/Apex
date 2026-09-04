const router = require('./api/routes/stockTransfer.routes');
const stockTransferService = require('./application/services/stockTransfer.service');
const { STOCK_TRANSFER_EVENTS } = require('./events/stockTransfer.events');

module.exports = {
  router,
  service: stockTransferService,
  events: STOCK_TRANSFER_EVENTS,
};
