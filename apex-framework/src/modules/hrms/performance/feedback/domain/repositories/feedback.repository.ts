const BaseRepository = require('../../../../../../core/BaseRepository');
const Feedback = require('../../infrastructure/models/feedback.model');

class FeedbackRepository extends BaseRepository {
  constructor() {
    super(Feedback);
  }

  // TODO: add Feedback-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new FeedbackRepository();
