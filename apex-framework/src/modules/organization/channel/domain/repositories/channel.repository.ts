const BaseRepository = require('../../../../../core/BaseRepository');
const Channel = require('../../infrastructure/models/channel.model');

class ChannelRepository extends BaseRepository {
  constructor() {
    super(Channel);
  }

  // TODO: add Channel-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new ChannelRepository();
