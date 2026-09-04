const router = require('./api/routes/accountEntry.routes');
const accountEntryService = require('./application/services/accountEntry.service');
const { ACCOUNT_ENTRY_EVENTS } = require('./events/accountEntry.events');

module.exports = {
  router,
  service: accountEntryService,
  events: ACCOUNT_ENTRY_EVENTS,
};
