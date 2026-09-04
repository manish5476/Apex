const BaseRepository = require('../../../../../core/BaseRepository');
const SalesReturn = require('../../infrastructure/models/salesReturn.model');

class SalesReturnRepository extends BaseRepository {
  constructor() {
    super(SalesReturn);
  }

  // TODO: add SalesReturn-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new SalesReturnRepository();
