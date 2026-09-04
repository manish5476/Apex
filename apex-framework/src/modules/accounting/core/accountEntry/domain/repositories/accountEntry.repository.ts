const BaseRepository = require('../../../../../../core/BaseRepository');
const AccountEntry = require('../../infrastructure/models/accountEntry.model');

class AccountEntryRepository extends BaseRepository {
  constructor() {
    super(AccountEntry);
  }

  // TODO: add AccountEntry-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new AccountEntryRepository();
