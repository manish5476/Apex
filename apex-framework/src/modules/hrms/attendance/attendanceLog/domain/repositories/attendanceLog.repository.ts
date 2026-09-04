const BaseRepository = require('../../../../../../core/BaseRepository');
const AttendanceLog = require('../../infrastructure/models/attendanceLog.model');

class AttendanceLogRepository extends BaseRepository {
  constructor() {
    super(AttendanceLog);
  }

  // TODO: add AttendanceLog-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new AttendanceLogRepository();
