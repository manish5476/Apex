const BaseRepository = require('../../../../../../core/BaseRepository');
const Emi = require('../../infrastructure/models/emi.model');

class EmiRepository extends BaseRepository {
  constructor() {
    super(Emi);
  }

  // TODO: add Emi-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new EmiRepository();
