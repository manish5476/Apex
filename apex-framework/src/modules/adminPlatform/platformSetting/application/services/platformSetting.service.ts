const platformSettingRepo = require('../../domain/repositories/platformSetting.repository');
const platformSettingCache = require('../../cache/platformSetting.cache');
const {
  publishPlatformSettingCreated,
  publishPlatformSettingUpdated,
  publishPlatformSettingDeleted,
} = require('../../events/platformSetting.events');
const ApiError = require('../../../../../core/ApiError');

class PlatformSettingService {
  async create(data) {
    const entity = await platformSettingRepo.create(data);
    await platformSettingCache.flushNamespace();
    publishPlatformSettingCreated(entity);
    return entity;
  }

  async getById(id) {
    return platformSettingCache.remember(`id:${id}`, 120, async () => {
      const entity = await platformSettingRepo.findById(id);
      if (!entity) throw ApiError.notFound('PlatformSetting not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return platformSettingCache.remember(cacheKey, 60, () => platformSettingRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await platformSettingRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('PlatformSetting not found');
    await platformSettingCache.forget(`id:${id}`);
    await platformSettingCache.flushNamespace();
    publishPlatformSettingUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await platformSettingRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('PlatformSetting not found');
    await platformSettingCache.forget(`id:${id}`);
    await platformSettingCache.flushNamespace();
    publishPlatformSettingDeleted(id);
    return entity;
  }
}

module.exports = new PlatformSettingService();
