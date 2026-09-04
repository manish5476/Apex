const BaseRepository = require('../../../../../core/BaseRepository');
const ShipmentActivity = require('../../infrastructure/models/shipmentActivity.model');

class ShipmentActivityRepository extends BaseRepository {
  constructor() {
    super(ShipmentActivity);
  }

  // TODO: add ShipmentActivity-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new ShipmentActivityRepository();
