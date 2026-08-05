const router = require('./api/routes/ai.routes');
const aiService = require('./application/services/ai.service');
const { AI_EVENTS } = require('./events/ai.events');

module.exports = {
  router,
  service: aiService,
  events: AI_EVENTS,
};
