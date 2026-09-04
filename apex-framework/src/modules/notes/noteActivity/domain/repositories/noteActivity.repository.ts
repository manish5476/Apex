const BaseRepository = require('../../../../../core/BaseRepository');
const NoteActivity = require('../../infrastructure/models/noteActivity.model');

class NoteActivityRepository extends BaseRepository {
  constructor() {
    super(NoteActivity);
  }

  // TODO: add NoteActivity-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new NoteActivityRepository();
