const BaseRepository = require('../../../../../core/BaseRepository');
const StorefrontCart = require('../../infrastructure/models/storefrontCart.model');

class StorefrontCartRepository extends BaseRepository {
  constructor() {
    super(StorefrontCart);
  }

  // TODO: add StorefrontCart-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new StorefrontCartRepository();
