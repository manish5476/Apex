const BaseRepository = require('../../../../../core/BaseRepository');
const Branch = require('../../infrastructure/models/branch.model');

class BranchRepository extends BaseRepository {
  constructor() {
    super(Branch);
  }

  // TODO: add Branch-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new BranchRepository();
