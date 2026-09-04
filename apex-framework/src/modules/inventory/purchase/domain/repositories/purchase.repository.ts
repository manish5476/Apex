const BaseRepository = require('../../../../../core/BaseRepository');
const Purchase = require('../../infrastructure/models/purchase.model');

class PurchaseRepository extends BaseRepository {
  constructor() {
    super(Purchase);
  }

  // TODO: add Purchase-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new PurchaseRepository();
