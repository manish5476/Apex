const BaseRepository = require('../../../../../../core/BaseRepository');
const SalaryStructure = require('../../infrastructure/models/salaryStructure.model');

class SalaryStructureRepository extends BaseRepository {
  constructor() {
    super(SalaryStructure);
  }

  // TODO: add SalaryStructure-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new SalaryStructureRepository();
