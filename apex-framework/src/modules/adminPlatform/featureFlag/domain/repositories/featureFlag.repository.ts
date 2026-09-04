const BaseRepository = require('../../../../../core/BaseRepository');
const FeatureFlag = require('../../infrastructure/models/featureFlag.model');

class FeatureFlagRepository extends BaseRepository {
  constructor() {
    super(FeatureFlag);
  }

  // TODO: add FeatureFlag-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new FeatureFlagRepository();
