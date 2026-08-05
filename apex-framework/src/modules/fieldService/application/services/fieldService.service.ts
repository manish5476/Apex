const fieldServiceRepo = require('../../domain/repositories/fieldService.repository');
const fieldServiceCache = require('../../cache/fieldService.cache');
const {
  publishFieldServiceCreated,
  publishFieldServiceUpdated,
  publishFieldServiceDeleted,
} = require('../../events/fieldService.events');
const ApiError = require('../../../../core/ApiError');

class FieldServiceService {
  async create(data) {
    const entity = await fieldServiceRepo.create(data);
    await fieldServiceCache.flushNamespace();
    publishFieldServiceCreated(entity);
    return entity;
  }

  async getById(id) {
    return fieldServiceCache.remember(`id:${id}`, 120, async () => {
      const entity = await fieldServiceRepo.findById(id);
      if (!entity) throw ApiError.notFound('FieldService not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return fieldServiceCache.remember(cacheKey, 60, () => fieldServiceRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await fieldServiceRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('FieldService not found');
    await fieldServiceCache.forget(`id:${id}`);
    await fieldServiceCache.flushNamespace();
    publishFieldServiceUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await fieldServiceRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('FieldService not found');
    await fieldServiceCache.forget(`id:${id}`);
    await fieldServiceCache.flushNamespace();
    publishFieldServiceDeleted(id);
    return entity;
  }
}

module.exports = new FieldServiceService();
