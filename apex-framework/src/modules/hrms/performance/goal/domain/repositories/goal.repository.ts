const BaseRepository = require('../../../../../../core/BaseRepository');
const Goal = require('../../infrastructure/models/goal.model');

class GoalRepository extends BaseRepository {
  constructor() {
    super(Goal);
  }

  // TODO: add Goal-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new GoalRepository();
