const BaseRepository = require('../../../../../core/BaseRepository');
const ProviderActivation = require('../../infrastructure/models/providerActivation.model');

class ProviderActivationRepository extends BaseRepository {
  constructor() {
    super(ProviderActivation);
  }

  // TODO: add ProviderActivation-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new ProviderActivationRepository();
