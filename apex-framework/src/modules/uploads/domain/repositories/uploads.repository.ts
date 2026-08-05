const BaseRepository = require('../../../../core/BaseRepository');
const Uploads = require('../../infrastructure/models/uploads.model');

class UploadsRepository extends BaseRepository {
  constructor() {
    super(Uploads);
  }

  // TODO: add Uploads-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new UploadsRepository();
