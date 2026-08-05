const router = require('./api/routes/account.routes');
const accountService = require('./application/services/account.service');
const { ACCOUNT_EVENTS } = require('./events/account.events');

module.exports = {
  router,
  service: accountService,
  events: ACCOUNT_EVENTS,
};
