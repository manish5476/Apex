const BaseRepository = require('../../../../../core/BaseRepository');
const WebhookCore = require('../../infrastructure/models/webhookCore.model');

class WebhookCoreRepository extends BaseRepository {
  constructor() {
    super(WebhookCore);
  }

  // TODO: add WebhookCore-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new WebhookCoreRepository();
