const BaseRepository = require('../../../../../core/BaseRepository');
const Message = require('../../infrastructure/models/message.model');

class MessageRepository extends BaseRepository {
  constructor() {
    super(Message);
  }

  // TODO: add Message-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new MessageRepository();
