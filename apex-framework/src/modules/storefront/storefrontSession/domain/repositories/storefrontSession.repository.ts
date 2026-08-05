const BaseRepository = require('../../../../../core/BaseRepository');
const StorefrontSession = require('../../infrastructure/models/storefrontSession.model');

class StorefrontSessionRepository extends BaseRepository {
  constructor() {
    super(StorefrontSession);
  }

  // TODO: add StorefrontSession-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new StorefrontSessionRepository();
