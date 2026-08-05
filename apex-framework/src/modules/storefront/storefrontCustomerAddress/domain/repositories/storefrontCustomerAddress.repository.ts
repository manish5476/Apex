const BaseRepository = require('../../../../../core/BaseRepository');
const StorefrontCustomerAddress = require('../../infrastructure/models/storefrontCustomerAddress.model');

class StorefrontCustomerAddressRepository extends BaseRepository {
  constructor() {
    super(StorefrontCustomerAddress);
  }

  // TODO: add StorefrontCustomerAddress-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new StorefrontCustomerAddressRepository();
