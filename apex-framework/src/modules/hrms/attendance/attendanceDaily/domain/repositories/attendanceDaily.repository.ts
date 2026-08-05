const BaseRepository = require('../../../../../../core/BaseRepository');
const AttendanceDaily = require('../../infrastructure/models/attendanceDaily.model');

class AttendanceDailyRepository extends BaseRepository {
  constructor() {
    super(AttendanceDaily);
  }

  // TODO: add AttendanceDaily-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new AttendanceDailyRepository();
