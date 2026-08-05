const notificationCoreRepo = require('../../domain/repositories/notificationCore.repository');
const notificationCoreCache = require('../../cache/notificationCore.cache');
const {
  publishNotificationCoreCreated,
  publishNotificationCoreUpdated,
  publishNotificationCoreDeleted,
} = require('../../events/notificationCore.events');
const ApiError = require('../../../../../core/ApiError');

class NotificationCoreService {
  async create(data) {
    const entity = await notificationCoreRepo.create(data);
    await notificationCoreCache.flushNamespace();
    publishNotificationCoreCreated(entity);
    return entity;
  }

  async getById(id) {
    return notificationCoreCache.remember(`id:${id}`, 120, async () => {
      const entity = await notificationCoreRepo.findById(id);
      if (!entity) throw ApiError.notFound('NotificationCore not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return notificationCoreCache.remember(cacheKey, 60, () => notificationCoreRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await notificationCoreRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('NotificationCore not found');
    await notificationCoreCache.forget(`id:${id}`);
    await notificationCoreCache.flushNamespace();
    publishNotificationCoreUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await notificationCoreRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('NotificationCore not found');
    await notificationCoreCache.forget(`id:${id}`);
    await notificationCoreCache.flushNamespace();
    publishNotificationCoreDeleted(id);
    return entity;
  }
}

module.exports = new NotificationCoreService();
