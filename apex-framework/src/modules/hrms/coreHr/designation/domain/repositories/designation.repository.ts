const BaseRepository = require('../../../../../../core/BaseRepository');
const Designation = require('../../infrastructure/models/designation.model');

class DesignationRepository extends BaseRepository {
  constructor() {
    super(Designation);
  }

  // TODO: add Designation-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new DesignationRepository();
