const BaseRepository = require('../../../../../core/BaseRepository');
const OutboxEvent = require('../../infrastructure/models/outboxEvent.model');

class OutboxEventRepository extends BaseRepository {
  constructor() {
    super(OutboxEvent);
  }

  // TODO: add OutboxEvent-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new OutboxEventRepository();
