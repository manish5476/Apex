const BaseRepository = require('../../../../core/BaseRepository');
const FieldService = require('../../infrastructure/models/fieldService.model');

class FieldServiceRepository extends BaseRepository {
  constructor() {
    super(FieldService);
  }

  // TODO: add FieldService-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new FieldServiceRepository();
