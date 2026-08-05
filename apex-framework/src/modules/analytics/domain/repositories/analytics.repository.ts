const BaseRepository = require('../../../../core/BaseRepository');
const Analytics = require('../../infrastructure/models/analytics.model');

class AnalyticsRepository extends BaseRepository {
  constructor() {
    super(Analytics);
  }

  // TODO: add Analytics-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new AnalyticsRepository();
