const BaseRepository = require('../../../../../core/BaseRepository');
const Counter = require('../../infrastructure/models/counter.model');

class CounterRepository extends BaseRepository {
  constructor() {
    super(Counter);
  }

  // TODO: add Counter-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new CounterRepository();
