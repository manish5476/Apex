const BaseRepository = require('../../../../../../core/BaseRepository');
const ShiftGroup = require('../../infrastructure/models/shiftGroup.model');

class ShiftGroupRepository extends BaseRepository {
  constructor() {
    super(ShiftGroup);
  }

  // TODO: add ShiftGroup-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new ShiftGroupRepository();
