const BaseRepository = require('../../../../../core/BaseRepository');
const StockTransfer = require('../../infrastructure/models/stockTransfer.model');

class StockTransferRepository extends BaseRepository {
  constructor() {
    super(StockTransfer);
  }

  // TODO: add StockTransfer-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new StockTransferRepository();
