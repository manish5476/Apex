const BaseRepository = require('../../../../../core/BaseRepository');
const ShipmentAssignment = require('../../infrastructure/models/shipmentAssignment.model');

class ShipmentAssignmentRepository extends BaseRepository {
  constructor() {
    super(ShipmentAssignment);
  }

  // TODO: add ShipmentAssignment-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new ShipmentAssignmentRepository();
