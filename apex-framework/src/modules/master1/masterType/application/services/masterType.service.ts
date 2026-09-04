const masterTypeRepo = require('../../domain/repositories/masterType.repository');
const masterTypeCache = require('../../cache/masterType.cache');
const {
  publishMasterTypeCreated,
  publishMasterTypeUpdated,
  publishMasterTypeDeleted,
} = require('../../events/masterType.events');
const ApiError = require('../../../../../core/ApiError');

class MasterTypeService {
  async create(data) {
    const entity = await masterTypeRepo.create(data);
    await masterTypeCache.flushNamespace();
    publishMasterTypeCreated(entity);
    return entity;
  }

  async getById(id) {
    return masterTypeCache.remember(`id:${id}`, 120, async () => {
      const entity = await masterTypeRepo.findById(id);
      if (!entity) throw ApiError.notFound('MasterType not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return masterTypeCache.remember(cacheKey, 60, () => masterTypeRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await masterTypeRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('MasterType not found');
    await masterTypeCache.forget(`id:${id}`);
    await masterTypeCache.flushNamespace();
    publishMasterTypeUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await masterTypeRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('MasterType not found');
    await masterTypeCache.forget(`id:${id}`);
    await masterTypeCache.flushNamespace();
    publishMasterTypeDeleted(id);
    return entity;
  }
}

module.exports = new MasterTypeService();
