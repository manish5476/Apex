const BaseRepository = require('../../../../../core/BaseRepository');
const StorefrontPageSnapshot = require('../../infrastructure/models/storefrontPageSnapshot.model');

class StorefrontPageSnapshotRepository extends BaseRepository {
  constructor() {
    super(StorefrontPageSnapshot);
  }

  // TODO: add StorefrontPageSnapshot-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new StorefrontPageSnapshotRepository();
