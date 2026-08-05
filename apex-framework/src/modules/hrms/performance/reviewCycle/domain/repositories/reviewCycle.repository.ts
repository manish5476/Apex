const BaseRepository = require('../../../../../../core/BaseRepository');
const ReviewCycle = require('../../infrastructure/models/reviewCycle.model');

class ReviewCycleRepository extends BaseRepository {
  constructor() {
    super(ReviewCycle);
  }

  // TODO: add ReviewCycle-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new ReviewCycleRepository();
