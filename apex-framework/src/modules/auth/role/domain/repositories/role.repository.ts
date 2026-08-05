const BaseRepository = require('../../../../../core/BaseRepository');
const Role = require('../../infrastructure/models/role.model');

class RoleRepository extends BaseRepository {
  constructor() {
    super(Role);
  }

  // TODO: add Role-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new RoleRepository();
