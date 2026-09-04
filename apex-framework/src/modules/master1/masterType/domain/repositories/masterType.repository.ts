const BaseRepository = require('../../../../../core/BaseRepository');
const MasterType = require('../../infrastructure/models/masterType.model');

class MasterTypeRepository extends BaseRepository {
  constructor() {
    super(MasterType);
  }

  // TODO: add MasterType-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new MasterTypeRepository();
