const BaseRepository = require('../../../../../core/BaseRepository');
const StorefrontCartItem = require('../../infrastructure/models/storefrontCartItem.model');

class StorefrontCartItemRepository extends BaseRepository {
  constructor() {
    super(StorefrontCartItem);
  }

  // TODO: add StorefrontCartItem-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new StorefrontCartItemRepository();
