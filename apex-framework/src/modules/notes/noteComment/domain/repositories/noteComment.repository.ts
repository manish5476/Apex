const BaseRepository = require('../../../../../core/BaseRepository');
const NoteComment = require('../../infrastructure/models/noteComment.model');

class NoteCommentRepository extends BaseRepository {
  constructor() {
    super(NoteComment);
  }

  // TODO: add NoteComment-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new NoteCommentRepository();
