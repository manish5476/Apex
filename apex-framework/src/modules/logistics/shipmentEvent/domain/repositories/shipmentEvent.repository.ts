const BaseRepository = require('../../../../../core/BaseRepository');
const ShipmentEvent = require('../../infrastructure/models/shipmentEvent.model');

class ShipmentEventRepository extends BaseRepository {
  constructor() {
    super(ShipmentEvent);
  }

  // TODO: add ShipmentEvent-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new ShipmentEventRepository();
