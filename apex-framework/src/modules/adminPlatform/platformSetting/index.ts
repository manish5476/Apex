const router = require('./api/routes/platformSetting.routes');
const platformSettingService = require('./application/services/platformSetting.service');
const { PLATFORM_SETTING_EVENTS } = require('./events/platformSetting.events');

module.exports = {
  router,
  service: platformSettingService,
  events: PLATFORM_SETTING_EVENTS,
};
