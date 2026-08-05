const BaseRepository = require('../../../../../core/BaseRepository');
const StorefrontWishlist = require('../../infrastructure/models/storefrontWishlist.model');

class StorefrontWishlistRepository extends BaseRepository {
  constructor() {
    super(StorefrontWishlist);
  }

  // TODO: add StorefrontWishlist-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new StorefrontWishlistRepository();
