const BaseRepository = require('../../../../../core/BaseRepository');
const GlobalDeliveryPartner = require('../../infrastructure/models/globalDeliveryPartner.model');

class GlobalDeliveryPartnerRepository extends BaseRepository {
  constructor() {
    super(GlobalDeliveryPartner);
  }

  // TODO: add GlobalDeliveryPartner-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new GlobalDeliveryPartnerRepository();
