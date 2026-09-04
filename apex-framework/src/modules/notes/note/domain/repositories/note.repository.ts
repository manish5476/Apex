const BaseRepository = require('../../../../../core/BaseRepository');
const Note = require('../../infrastructure/models/note.model');

class NoteRepository extends BaseRepository {
  constructor() {
    super(Note);
  }

  // TODO: add Note-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new NoteRepository();
