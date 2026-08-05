const analyticsRepo = require('../../domain/repositories/analytics.repository');
const analyticsCache = require('../../cache/analytics.cache');
const {
  publishAnalyticsCreated,
  publishAnalyticsUpdated,
  publishAnalyticsDeleted,
} = require('../../events/analytics.events');
const ApiError = require('../../../../core/ApiError');

class AnalyticsService {
  async create(data) {
    const entity = await analyticsRepo.create(data);
    await analyticsCache.flushNamespace();
    publishAnalyticsCreated(entity);
    return entity;
  }

  async getById(id) {
    return analyticsCache.remember(`id:${id}`, 120, async () => {
      const entity = await analyticsRepo.findById(id);
      if (!entity) throw ApiError.notFound('Analytics not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return analyticsCache.remember(cacheKey, 60, () => analyticsRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await analyticsRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Analytics not found');
    await analyticsCache.forget(`id:${id}`);
    await analyticsCache.flushNamespace();
    publishAnalyticsUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await analyticsRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Analytics not found');
    await analyticsCache.forget(`id:${id}`);
    await analyticsCache.flushNamespace();
    publishAnalyticsDeleted(id);
    return entity;
  }
}

module.exports = new AnalyticsService();
