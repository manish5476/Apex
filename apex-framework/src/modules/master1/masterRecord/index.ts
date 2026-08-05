const router = require('./api/routes/masterRecord.routes');
const masterRecordService = require('./application/services/masterRecord.service');
const { MASTER_RECORD_EVENTS } = require('./events/masterRecord.events');

module.exports = {
  router,
  service: masterRecordService,
  events: MASTER_RECORD_EVENTS,
};
