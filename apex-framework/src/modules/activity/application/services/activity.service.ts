const activityRepo = require('../../domain/repositories/activity.repository');
const activityCache = require('../../cache/activity.cache');
const {
  publishActivityCreated,
  publishActivityUpdated,
  publishActivityDeleted,
} = require('../../events/activity.events');
const ApiError = require('../../../../core/ApiError');

class ActivityService {
  async create(data) {
    const entity = await activityRepo.create(data);
    await activityCache.flushNamespace();
    publishActivityCreated(entity);
    return entity;
  }

  async getById(id) {
    return activityCache.remember(`id:${id}`, 120, async () => {
      const entity = await activityRepo.findById(id);
      if (!entity) throw ApiError.notFound('Activity not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return activityCache.remember(cacheKey, 60, () => activityRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await activityRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Activity not found');
    await activityCache.forget(`id:${id}`);
    await activityCache.flushNamespace();
    publishActivityUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await activityRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Activity not found');
    await activityCache.forget(`id:${id}`);
    await activityCache.flushNamespace();
    publishActivityDeleted(id);
    return entity;
  }
}

module.exports = new ActivityService();
