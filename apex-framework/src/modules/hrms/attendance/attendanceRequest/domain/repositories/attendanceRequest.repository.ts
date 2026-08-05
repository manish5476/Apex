const BaseRepository = require('../../../../../../core/BaseRepository');
const AttendanceRequest = require('../../infrastructure/models/attendanceRequest.model');

class AttendanceRequestRepository extends BaseRepository {
  constructor() {
    super(AttendanceRequest);
  }

  // TODO: add AttendanceRequest-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new AttendanceRequestRepository();
