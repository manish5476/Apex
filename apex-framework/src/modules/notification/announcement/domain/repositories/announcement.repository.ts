const BaseRepository = require('../../../../../core/BaseRepository');
const Announcement = require('../../infrastructure/models/announcement.model');

class AnnouncementRepository extends BaseRepository {
  constructor() {
    super(Announcement);
  }

  // TODO: add Announcement-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new AnnouncementRepository();
