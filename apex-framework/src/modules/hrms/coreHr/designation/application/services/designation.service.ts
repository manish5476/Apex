const designationRepo = require('../../domain/repositories/designation.repository');
const designationCache = require('../../cache/designation.cache');
const {
  publishDesignationCreated,
  publishDesignationUpdated,
  publishDesignationDeleted,
} = require('../../events/designation.events');
const ApiError = require('../../../../../../core/ApiError');

class DesignationService {
  async create(data) {
    const entity = await designationRepo.create(data);
    await designationCache.flushNamespace();
    publishDesignationCreated(entity);
    return entity;
  }

  async getById(id) {
    return designationCache.remember(`id:${id}`, 120, async () => {
      const entity = await designationRepo.findById(id);
      if (!entity) throw ApiError.notFound('Designation not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return designationCache.remember(cacheKey, 60, () => designationRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await designationRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Designation not found');
    await designationCache.forget(`id:${id}`);
    await designationCache.flushNamespace();
    publishDesignationUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await designationRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Designation not found');
    await designationCache.forget(`id:${id}`);
    await designationCache.flushNamespace();
    publishDesignationDeleted(id);
    return entity;
  }
}

module.exports = new DesignationService();
