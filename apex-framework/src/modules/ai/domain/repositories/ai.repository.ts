const BaseRepository = require('../../../../core/BaseRepository');
const Ai = require('../../infrastructure/models/ai.model');

class AiRepository extends BaseRepository {
  constructor() {
    super(Ai);
  }

  // TODO: add Ai-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new AiRepository();
