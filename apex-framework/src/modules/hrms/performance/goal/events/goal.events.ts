const eventBus = require('../../../../../core/eventBus');

const GOAL_EVENTS = {
  CREATED: 'goal.created',
  UPDATED: 'goal.updated',
  DELETED: 'goal.deleted',
};

function publishGoalCreated(entity) {
  eventBus.publish(GOAL_EVENTS.CREATED, { id: entity._id });
}

function publishGoalUpdated(entity) {
  eventBus.publish(GOAL_EVENTS.UPDATED, { id: entity._id });
}

function publishGoalDeleted(id) {
  eventBus.publish(GOAL_EVENTS.DELETED, { id });
}

module.exports = {
  GOAL_EVENTS,
  publishGoalCreated,
  publishGoalUpdated,
  publishGoalDeleted,
};
