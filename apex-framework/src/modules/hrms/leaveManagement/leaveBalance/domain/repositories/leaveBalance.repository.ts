const BaseRepository = require('../../../../../../core/BaseRepository');
const LeaveBalance = require('../../infrastructure/models/leaveBalance.model');

class LeaveBalanceRepository extends BaseRepository {
  constructor() {
    super(LeaveBalance);
  }

  // TODO: add LeaveBalance-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new LeaveBalanceRepository();
