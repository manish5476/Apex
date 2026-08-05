const BaseRepository = require('../../../../../../core/BaseRepository');
const Employee = require('../../infrastructure/models/employee.model');

class EmployeeRepository extends BaseRepository {
  constructor() {
    super(Employee);
  }

  // TODO: add Employee-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new EmployeeRepository();
