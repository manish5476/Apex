const BaseRepository = require('../../../../../core/BaseRepository');
const Driver = require('../../infrastructure/models/driver.model');

class DriverRepository extends BaseRepository {
  constructor() {
    super(Driver);
  }

  // TODO: add Driver-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new DriverRepository();
