const BaseRepository = require('../../../../../core/BaseRepository');
const NotificationCore = require('../../infrastructure/models/notificationCore.model');

class NotificationCoreRepository extends BaseRepository {
  constructor() {
    super(NotificationCore);
  }

  // TODO: add NotificationCore-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new NotificationCoreRepository();
