const BaseRepository = require('../../../../core/BaseRepository');
const Feed = require('../../infrastructure/models/feed.model');

class FeedRepository extends BaseRepository {
  constructor() {
    super(Feed);
  }

  // TODO: add Feed-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new FeedRepository();
