const BaseRepository = require('../../../../../core/BaseRepository');
const Vehicle = require('../../infrastructure/models/vehicle.model');

class VehicleRepository extends BaseRepository {
  constructor() {
    super(Vehicle);
  }

  // TODO: add Vehicle-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new VehicleRepository();
