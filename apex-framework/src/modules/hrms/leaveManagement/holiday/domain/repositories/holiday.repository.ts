const BaseRepository = require('../../../../../../core/BaseRepository');
const Holiday = require('../../infrastructure/models/holiday.model');

class HolidayRepository extends BaseRepository {
  constructor() {
    super(Holiday);
  }

  // TODO: add Holiday-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new HolidayRepository();
