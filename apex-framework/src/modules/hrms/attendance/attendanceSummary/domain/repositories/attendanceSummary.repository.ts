const BaseRepository = require('../../../../../../core/BaseRepository');
const AttendanceSummary = require('../../infrastructure/models/attendanceSummary.model');

class AttendanceSummaryRepository extends BaseRepository {
  constructor() {
    super(AttendanceSummary);
  }

  // TODO: add AttendanceSummary-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new AttendanceSummaryRepository();
