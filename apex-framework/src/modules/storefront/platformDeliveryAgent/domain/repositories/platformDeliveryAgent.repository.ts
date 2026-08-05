const BaseRepository = require('../../../../../core/BaseRepository');
const PlatformDeliveryAgent = require('../../infrastructure/models/platformDeliveryAgent.model');

class PlatformDeliveryAgentRepository extends BaseRepository {
  constructor() {
    super(PlatformDeliveryAgent);
  }

  // TODO: add PlatformDeliveryAgent-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new PlatformDeliveryAgentRepository();
