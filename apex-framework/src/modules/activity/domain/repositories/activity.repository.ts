const BaseRepository = require('../../../../core/BaseRepository');
const Activity = require('../../infrastructure/models/activity.model');

class ActivityRepository extends BaseRepository {
  constructor() {
    super(Activity);
  }

  // TODO: add Activity-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new ActivityRepository();
