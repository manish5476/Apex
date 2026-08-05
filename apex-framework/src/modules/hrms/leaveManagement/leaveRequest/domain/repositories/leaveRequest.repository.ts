const BaseRepository = require('../../../../../../core/BaseRepository');
const LeaveRequest = require('../../infrastructure/models/leaveRequest.model');

class LeaveRequestRepository extends BaseRepository {
  constructor() {
    super(LeaveRequest);
  }

  // TODO: add LeaveRequest-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new LeaveRequestRepository();
