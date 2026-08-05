const BaseRepository = require('../../../../../core/BaseRepository');
const Sales = require('../../infrastructure/models/sales.model');

class SalesRepository extends BaseRepository {
  constructor() {
    super(Sales);
  }

  // TODO: add Sales-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new SalesRepository();
