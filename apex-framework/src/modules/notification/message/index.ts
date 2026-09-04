const router = require('./api/routes/message.routes');
const messageService = require('./application/services/message.service');
const { MESSAGE_EVENTS } = require('./events/message.events');

module.exports = {
  router,
  service: messageService,
  events: MESSAGE_EVENTS,
};
