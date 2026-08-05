const BaseRepository = require('../../../../../core/BaseRepository');
const Customer = require('../../infrastructure/models/customer.model');

class CustomerRepository extends BaseRepository {
  constructor() {
    super(Customer);
  }

  // TODO: add Customer-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new CustomerRepository();
