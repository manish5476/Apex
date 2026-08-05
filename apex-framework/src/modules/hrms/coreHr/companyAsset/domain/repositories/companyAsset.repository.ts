const BaseRepository = require('../../../../../../core/BaseRepository');
const CompanyAsset = require('../../infrastructure/models/companyAsset.model');

class CompanyAssetRepository extends BaseRepository {
  constructor() {
    super(CompanyAsset);
  }

  // TODO: add CompanyAsset-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new CompanyAssetRepository();
