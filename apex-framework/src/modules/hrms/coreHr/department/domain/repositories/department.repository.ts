const BaseRepository = require('../../../../../../core/BaseRepository');
const Department = require('../../infrastructure/models/department.model');

class DepartmentRepository extends BaseRepository {
  constructor() {
    super(Department);
  }

  // TODO: add Department-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new DepartmentRepository();
