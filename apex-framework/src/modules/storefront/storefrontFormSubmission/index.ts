const router = require('./api/routes/storefrontFormSubmission.routes');
const storefrontFormSubmissionService = require('./application/services/storefrontFormSubmission.service');
const { STOREFRONT_FORM_SUBMISSION_EVENTS } = require('./events/storefrontFormSubmission.events');

module.exports = {
  router,
  service: storefrontFormSubmissionService,
  events: STOREFRONT_FORM_SUBMISSION_EVENTS,
};
