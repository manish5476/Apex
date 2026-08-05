const BaseRepository = require('../../../../../../core/BaseRepository');
const Account = require('../../infrastructure/models/account.model');

class AccountRepository extends BaseRepository {
  constructor() {
    super(Account);
  }

  // TODO: add Account-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new AccountRepository();
