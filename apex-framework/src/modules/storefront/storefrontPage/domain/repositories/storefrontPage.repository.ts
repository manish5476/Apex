const BaseRepository = require('../../../../../core/BaseRepository');
const StorefrontPage = require('../../infrastructure/models/storefrontPage.model');

class StorefrontPageRepository extends BaseRepository {
  constructor() {
    super(StorefrontPage);
  }

  // TODO: add StorefrontPage-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new StorefrontPageRepository();
