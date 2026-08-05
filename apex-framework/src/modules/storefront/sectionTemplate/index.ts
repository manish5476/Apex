const router = require('./api/routes/sectionTemplate.routes');
const sectionTemplateService = require('./application/services/sectionTemplate.service');
const { SECTION_TEMPLATE_EVENTS } = require('./events/sectionTemplate.events');

module.exports = {
  router,
  service: sectionTemplateService,
  events: SECTION_TEMPLATE_EVENTS,
};
