const eventBus = require('../../../../core/eventBus');

const PLATFORM_SETTING_EVENTS = {
  CREATED: 'platformSetting.created',
  UPDATED: 'platformSetting.updated',
  DELETED: 'platformSetting.deleted',
};

function publishPlatformSettingCreated(entity) {
  eventBus.publish(PLATFORM_SETTING_EVENTS.CREATED, { id: entity._id });
}

function publishPlatformSettingUpdated(entity) {
  eventBus.publish(PLATFORM_SETTING_EVENTS.UPDATED, { id: entity._id });
}

function publishPlatformSettingDeleted(id) {
  eventBus.publish(PLATFORM_SETTING_EVENTS.DELETED, { id });
}

module.exports = {
  PLATFORM_SETTING_EVENTS,
  publishPlatformSettingCreated,
  publishPlatformSettingUpdated,
  publishPlatformSettingDeleted,
};
