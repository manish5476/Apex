const BaseRepository = require('../../../../../../core/BaseRepository');
const Payslip = require('../../infrastructure/models/payslip.model');

class PayslipRepository extends BaseRepository {
  constructor() {
    super(Payslip);
  }

  // TODO: add Payslip-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new PayslipRepository();
