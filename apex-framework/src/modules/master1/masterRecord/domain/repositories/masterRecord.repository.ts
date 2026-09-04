const BaseRepository = require('../../../../../core/BaseRepository');
const MasterRecord = require('../../infrastructure/models/masterRecord.model');

class MasterRecordRepository extends BaseRepository {
  constructor() {
    super(MasterRecord);
  }

  // TODO: add MasterRecord-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new MasterRecordRepository();
