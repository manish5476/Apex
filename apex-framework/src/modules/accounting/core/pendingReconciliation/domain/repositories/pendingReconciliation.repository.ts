const BaseRepository = require('../../../../../../core/BaseRepository');
const PendingReconciliation = require('../../infrastructure/models/pendingReconciliation.model');

class PendingReconciliationRepository extends BaseRepository {
  constructor() {
    super(PendingReconciliation);
  }

  // TODO: add PendingReconciliation-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new PendingReconciliationRepository();
