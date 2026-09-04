const BaseRepository = require('../../../../../core/BaseRepository');
const StorefrontLayout = require('../../infrastructure/models/storefrontLayout.model');

class StorefrontLayoutRepository extends BaseRepository {
  constructor() {
    super(StorefrontLayout);
  }

  // TODO: add StorefrontLayout-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new StorefrontLayoutRepository();
