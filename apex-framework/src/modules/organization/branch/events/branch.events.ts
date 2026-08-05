const eventBus = require('../../../../core/eventBus');

const BRANCH_EVENTS = {
  CREATED: 'branch.created',
  UPDATED: 'branch.updated',
  DELETED: 'branch.deleted',
};

function publishBranchCreated(entity) {
  eventBus.publish(BRANCH_EVENTS.CREATED, { id: entity._id });
}

function publishBranchUpdated(entity) {
  eventBus.publish(BRANCH_EVENTS.UPDATED, { id: entity._id });
}

function publishBranchDeleted(id) {
  eventBus.publish(BRANCH_EVENTS.DELETED, { id });
}

module.exports = {
  BRANCH_EVENTS,
  publishBranchCreated,
  publishBranchUpdated,
  publishBranchDeleted,
};
