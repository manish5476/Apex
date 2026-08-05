const BaseRepository = require('../../../../../../core/BaseRepository');
const ShiftAssignment = require('../../infrastructure/models/shiftAssignment.model');

class ShiftAssignmentRepository extends BaseRepository {
  constructor() {
    super(ShiftAssignment);
  }

  // TODO: add ShiftAssignment-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new ShiftAssignmentRepository();
