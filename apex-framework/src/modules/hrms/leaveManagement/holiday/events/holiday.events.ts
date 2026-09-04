const eventBus = require('../../../../../core/eventBus');

const HOLIDAY_EVENTS = {
  CREATED: 'holiday.created',
  UPDATED: 'holiday.updated',
  DELETED: 'holiday.deleted',
};

function publishHolidayCreated(entity) {
  eventBus.publish(HOLIDAY_EVENTS.CREATED, { id: entity._id });
}

function publishHolidayUpdated(entity) {
  eventBus.publish(HOLIDAY_EVENTS.UPDATED, { id: entity._id });
}

function publishHolidayDeleted(id) {
  eventBus.publish(HOLIDAY_EVENTS.DELETED, { id });
}

module.exports = {
  HOLIDAY_EVENTS,
  publishHolidayCreated,
  publishHolidayUpdated,
  publishHolidayDeleted,
};
