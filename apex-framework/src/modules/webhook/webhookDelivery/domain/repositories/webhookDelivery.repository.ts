const BaseRepository = require('../../../../../core/BaseRepository');
const WebhookDelivery = require('../../infrastructure/models/webhookDelivery.model');

class WebhookDeliveryRepository extends BaseRepository {
  constructor() {
    super(WebhookDelivery);
  }

  // TODO: add WebhookDelivery-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new WebhookDeliveryRepository();
