const featureFlagRepo = require('../../domain/repositories/featureFlag.repository');
const featureFlagCache = require('../../cache/featureFlag.cache');
const {
  publishFeatureFlagCreated,
  publishFeatureFlagUpdated,
  publishFeatureFlagDeleted,
} = require('../../events/featureFlag.events');
const ApiError = require('../../../../../core/ApiError');

class FeatureFlagService {
  async create(data) {
    const entity = await featureFlagRepo.create(data);
    await featureFlagCache.flushNamespace();
    publishFeatureFlagCreated(entity);
    return entity;
  }

  async getById(id) {
    return featureFlagCache.remember(`id:${id}`, 120, async () => {
      const entity = await featureFlagRepo.findById(id);
      if (!entity) throw ApiError.notFound('FeatureFlag not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return featureFlagCache.remember(cacheKey, 60, () => featureFlagRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await featureFlagRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('FeatureFlag not found');
    await featureFlagCache.forget(`id:${id}`);
    await featureFlagCache.flushNamespace();
    publishFeatureFlagUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await featureFlagRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('FeatureFlag not found');
    await featureFlagCache.forget(`id:${id}`);
    await featureFlagCache.flushNamespace();
    publishFeatureFlagDeleted(id);
    return entity;
  }
}

module.exports = new FeatureFlagService();
