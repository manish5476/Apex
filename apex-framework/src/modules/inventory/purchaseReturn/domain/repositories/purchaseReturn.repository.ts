const BaseRepository = require('../../../../../core/BaseRepository');
const PurchaseReturn = require('../../infrastructure/models/purchaseReturn.model');

class PurchaseReturnRepository extends BaseRepository {
  constructor() {
    super(PurchaseReturn);
  }

  // TODO: add PurchaseReturn-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new PurchaseReturnRepository();
