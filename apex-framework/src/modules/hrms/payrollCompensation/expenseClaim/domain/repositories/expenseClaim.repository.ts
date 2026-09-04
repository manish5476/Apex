const BaseRepository = require('../../../../../../core/BaseRepository');
const ExpenseClaim = require('../../infrastructure/models/expenseClaim.model');

class ExpenseClaimRepository extends BaseRepository {
  constructor() {
    super(ExpenseClaim);
  }

  // TODO: add ExpenseClaim-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new ExpenseClaimRepository();
