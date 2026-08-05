const BaseRepository = require('../../../../../core/BaseRepository');
const SmartRule = require('../../infrastructure/models/smartRule.model');

class SmartRuleRepository extends BaseRepository {
  constructor() {
    super(SmartRule);
  }

  // TODO: add SmartRule-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new SmartRuleRepository();
