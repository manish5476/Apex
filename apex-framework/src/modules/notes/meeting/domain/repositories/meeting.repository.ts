const BaseRepository = require('../../../../../core/BaseRepository');
const Meeting = require('../../infrastructure/models/meeting.model');

class MeetingRepository extends BaseRepository {
  constructor() {
    super(Meeting);
  }

  // TODO: add Meeting-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new MeetingRepository();
