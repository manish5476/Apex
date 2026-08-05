const BaseRepository = require('../../../../../core/BaseRepository');
const OrganizationProfile = require('../../infrastructure/models/organizationProfile.model');

class OrganizationProfileRepository extends BaseRepository {
  constructor() {
    super(OrganizationProfile);
  }

  // TODO: add OrganizationProfile-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new OrganizationProfileRepository();
