const announcementRepo = require('../../domain/repositories/announcement.repository');
const announcementCache = require('../../cache/announcement.cache');
const {
  publishAnnouncementCreated,
  publishAnnouncementUpdated,
  publishAnnouncementDeleted,
} = require('../../events/announcement.events');
const ApiError = require('../../../../../core/ApiError');

class AnnouncementService {
  async create(data) {
    const entity = await announcementRepo.create(data);
    await announcementCache.flushNamespace();
    publishAnnouncementCreated(entity);
    return entity;
  }

  async getById(id) {
    return announcementCache.remember(`id:${id}`, 120, async () => {
      const entity = await announcementRepo.findById(id);
      if (!entity) throw ApiError.notFound('Announcement not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return announcementCache.remember(cacheKey, 60, () => announcementRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await announcementRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Announcement not found');
    await announcementCache.forget(`id:${id}`);
    await announcementCache.flushNamespace();
    publishAnnouncementUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await announcementRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Announcement not found');
    await announcementCache.forget(`id:${id}`);
    await announcementCache.flushNamespace();
    publishAnnouncementDeleted(id);
    return entity;
  }
}

module.exports = new AnnouncementService();
