const BaseRepository = require('../../../../core/BaseRepository');
const Dashboard = require('../../infrastructure/models/dashboard.model');

class DashboardRepository extends BaseRepository {
  constructor() {
    super(Dashboard);
  }

  // TODO: add Dashboard-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new DashboardRepository();
