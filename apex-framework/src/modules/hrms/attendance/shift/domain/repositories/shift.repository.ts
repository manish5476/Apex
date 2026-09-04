const BaseRepository = require('../../../../../../core/BaseRepository');
const Shift = require('../../infrastructure/models/shift.model');

class ShiftRepository extends BaseRepository {
  constructor() {
    super(Shift);
  }

  // TODO: add Shift-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new ShiftRepository();
