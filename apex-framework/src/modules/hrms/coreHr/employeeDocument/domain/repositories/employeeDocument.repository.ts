const BaseRepository = require('../../../../../../core/BaseRepository');
const EmployeeDocument = require('../../infrastructure/models/employeeDocument.model');

class EmployeeDocumentRepository extends BaseRepository {
  constructor() {
    super(EmployeeDocument);
  }

  // TODO: add EmployeeDocument-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new EmployeeDocumentRepository();
