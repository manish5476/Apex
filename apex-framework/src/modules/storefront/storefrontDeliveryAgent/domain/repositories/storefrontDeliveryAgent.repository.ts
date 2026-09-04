const BaseRepository = require('../../../../../core/BaseRepository');
const StorefrontDeliveryAgent = require('../../infrastructure/models/storefrontDeliveryAgent.model');

class StorefrontDeliveryAgentRepository extends BaseRepository {
  constructor() {
    super(StorefrontDeliveryAgent);
  }

  // TODO: add StorefrontDeliveryAgent-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new StorefrontDeliveryAgentRepository();
