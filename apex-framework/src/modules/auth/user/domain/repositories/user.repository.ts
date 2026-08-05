const BaseRepository = require('../../../../../core/BaseRepository');
const User = require('../../infrastructure/models/user.model');

class UserRepository extends BaseRepository {
  constructor() {
    super(User);
  }

  // TODO: add User-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new UserRepository();
