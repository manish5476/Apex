const BaseRepository = require('../../../../../core/BaseRepository');
const Session = require('../../infrastructure/models/session.model');

class SessionRepository extends BaseRepository {
  constructor() {
    super(Session);
  }

  // TODO: add Session-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new SessionRepository();
