const BaseRepository = require('../../../../../core/BaseRepository');
const StorefrontCustomer = require('../../infrastructure/models/storefrontCustomer.model');

class StorefrontCustomerRepository extends BaseRepository {
  constructor() {
    super(StorefrontCustomer);
  }

  // TODO: add StorefrontCustomer-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new StorefrontCustomerRepository();
