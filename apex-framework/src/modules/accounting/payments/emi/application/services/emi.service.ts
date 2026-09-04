const emiRepo = require('../../domain/repositories/emi.repository');
const emiCache = require('../../cache/emi.cache');
const {
  publishEmiCreated,
  publishEmiUpdated,
  publishEmiDeleted,
} = require('../../events/emi.events');
const ApiError = require('../../../../../../core/ApiError');

class EmiService {
  async create(data) {
    const entity = await emiRepo.create(data);
    await emiCache.flushNamespace();
    publishEmiCreated(entity);
    return entity;
  }

  async getById(id) {
    return emiCache.remember(`id:${id}`, 120, async () => {
      const entity = await emiRepo.findById(id);
      if (!entity) throw ApiError.notFound('Emi not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return emiCache.remember(cacheKey, 60, () => emiRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await emiRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Emi not found');
    await emiCache.forget(`id:${id}`);
    await emiCache.flushNamespace();
    publishEmiUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await emiRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Emi not found');
    await emiCache.forget(`id:${id}`);
    await emiCache.flushNamespace();
    publishEmiDeleted(id);
    return entity;
  }
}

module.exports = new EmiService();
