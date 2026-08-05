const BaseRepository = require('../../../../../core/BaseRepository');
const PlatformAudit = require('../../infrastructure/models/platformAudit.model');

class PlatformAuditRepository extends BaseRepository {
  constructor() {
    super(PlatformAudit);
  }

  // TODO: add PlatformAudit-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new PlatformAuditRepository();
