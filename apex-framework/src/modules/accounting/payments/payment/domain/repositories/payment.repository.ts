const BaseRepository = require('../../../../../../core/BaseRepository');
const Payment = require('../../infrastructure/models/payment.model');

class PaymentRepository extends BaseRepository {
  constructor() {
    super(Payment);
  }

  // TODO: add Payment-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new PaymentRepository();
