const BaseRepository = require('../../../../../../core/BaseRepository');
const Invoice = require('../../infrastructure/models/invoice.model');

class InvoiceRepository extends BaseRepository {
  constructor() {
    super(Invoice);
  }

  // TODO: add Invoice-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new InvoiceRepository();
