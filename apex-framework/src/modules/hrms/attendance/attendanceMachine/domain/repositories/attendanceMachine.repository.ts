const BaseRepository = require('../../../../../../core/BaseRepository');
const AttendanceMachine = require('../../infrastructure/models/attendanceMachine.model');

class AttendanceMachineRepository extends BaseRepository {
  constructor() {
    super(AttendanceMachine);
  }

  // TODO: add AttendanceMachine-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new AttendanceMachineRepository();
