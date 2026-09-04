const BaseRepository = require('../../../../../../core/BaseRepository');
const TaxDeduction = require('../../infrastructure/models/taxDeduction.model');

class TaxDeductionRepository extends BaseRepository {
  constructor() {
    super(TaxDeduction);
  }

  // TODO: add TaxDeduction-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new TaxDeductionRepository();
