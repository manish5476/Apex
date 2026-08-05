const eventBus = require('../../../core/eventBus');

const DASHBOARD_EVENTS = {
  CREATED: 'dashboard.created',
  UPDATED: 'dashboard.updated',
  DELETED: 'dashboard.deleted',
};

function publishDashboardCreated(entity) {
  eventBus.publish(DASHBOARD_EVENTS.CREATED, { id: entity._id });
}

function publishDashboardUpdated(entity) {
  eventBus.publish(DASHBOARD_EVENTS.UPDATED, { id: entity._id });
}

function publishDashboardDeleted(id) {
  eventBus.publish(DASHBOARD_EVENTS.DELETED, { id });
}

module.exports = {
  DASHBOARD_EVENTS,
  publishDashboardCreated,
  publishDashboardUpdated,
  publishDashboardDeleted,
};
