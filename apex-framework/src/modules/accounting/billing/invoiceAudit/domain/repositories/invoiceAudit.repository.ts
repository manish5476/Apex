const BaseRepository = require('../../../../../../core/BaseRepository');
const InvoiceAudit = require('../../infrastructure/models/invoiceAudit.model');

class InvoiceAuditRepository extends BaseRepository {
  constructor() {
    super(InvoiceAudit);
  }

  // TODO: add InvoiceAudit-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new InvoiceAuditRepository();
