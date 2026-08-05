const BaseRepository = require('../../../../../core/BaseRepository');
const PlatformSetting = require('../../infrastructure/models/platformSetting.model');

class PlatformSettingRepository extends BaseRepository {
  constructor() {
    super(PlatformSetting);
  }

  // TODO: add PlatformSetting-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new PlatformSettingRepository();
