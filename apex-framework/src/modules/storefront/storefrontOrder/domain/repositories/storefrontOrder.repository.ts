const BaseRepository = require('../../../../../core/BaseRepository');
const StorefrontOrder = require('../../infrastructure/models/storefrontOrder.model');

class StorefrontOrderRepository extends BaseRepository {
  constructor() {
    super(StorefrontOrder);
  }

  // TODO: add StorefrontOrder-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new StorefrontOrderRepository();
