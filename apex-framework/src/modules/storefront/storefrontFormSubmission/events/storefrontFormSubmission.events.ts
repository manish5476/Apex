const eventBus = require('../../../../core/eventBus');

const STOREFRONT_FORM_SUBMISSION_EVENTS = {
  CREATED: 'storefrontFormSubmission.created',
  UPDATED: 'storefrontFormSubmission.updated',
  DELETED: 'storefrontFormSubmission.deleted',
};

function publishStorefrontFormSubmissionCreated(entity) {
  eventBus.publish(STOREFRONT_FORM_SUBMISSION_EVENTS.CREATED, { id: entity._id });
}

function publishStorefrontFormSubmissionUpdated(entity) {
  eventBus.publish(STOREFRONT_FORM_SUBMISSION_EVENTS.UPDATED, { id: entity._id });
}

function publishStorefrontFormSubmissionDeleted(id) {
  eventBus.publish(STOREFRONT_FORM_SUBMISSION_EVENTS.DELETED, { id });
}

module.exports = {
  STOREFRONT_FORM_SUBMISSION_EVENTS,
  publishStorefrontFormSubmissionCreated,
  publishStorefrontFormSubmissionUpdated,
  publishStorefrontFormSubmissionDeleted,
};
