const eventBus = require('../../../../../core/eventBus');

const REVIEW_CYCLE_EVENTS = {
  CREATED: 'reviewCycle.created',
  UPDATED: 'reviewCycle.updated',
  DELETED: 'reviewCycle.deleted',
};

function publishReviewCycleCreated(entity) {
  eventBus.publish(REVIEW_CYCLE_EVENTS.CREATED, { id: entity._id });
}

function publishReviewCycleUpdated(entity) {
  eventBus.publish(REVIEW_CYCLE_EVENTS.UPDATED, { id: entity._id });
}

function publishReviewCycleDeleted(id) {
  eventBus.publish(REVIEW_CYCLE_EVENTS.DELETED, { id });
}

module.exports = {
  REVIEW_CYCLE_EVENTS,
  publishReviewCycleCreated,
  publishReviewCycleUpdated,
  publishReviewCycleDeleted,
};
