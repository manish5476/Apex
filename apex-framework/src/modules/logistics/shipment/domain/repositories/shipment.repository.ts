const BaseRepository = require('../../../../../core/BaseRepository');
const Shipment = require('../../infrastructure/models/shipment.model');

class ShipmentRepository extends BaseRepository {
  constructor() {
    super(Shipment);
  }

  // TODO: add Shipment-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new ShipmentRepository();
