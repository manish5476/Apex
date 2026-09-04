const BaseRepository = require('../../../../../../core/BaseRepository');
const LeaveTransaction = require('../../infrastructure/models/leaveTransaction.model');

class LeaveTransactionRepository extends BaseRepository {
  constructor() {
    super(LeaveTransaction);
  }

  // TODO: add LeaveTransaction-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new LeaveTransactionRepository();
