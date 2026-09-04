const BaseRepository = require('../../../../../../core/BaseRepository');
const GeoFencing = require('../../infrastructure/models/geoFencing.model');

class GeoFencingRepository extends BaseRepository {
  constructor() {
    super(GeoFencing);
  }

  // TODO: add GeoFencing-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new GeoFencingRepository();
