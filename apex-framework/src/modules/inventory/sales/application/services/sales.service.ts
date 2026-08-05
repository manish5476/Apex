const salesRepo = require('../../domain/repositories/sales.repository');
const salesCache = require('../../cache/sales.cache');
const {
  publishSalesCreated,
  publishSalesUpdated,
  publishSalesDeleted,
} = require('../../events/sales.events');
const ApiError = require('../../../../../core/ApiError');

class SalesService {
  async create(data) {
    const entity = await salesRepo.create(data);
    await salesCache.flushNamespace();
    publishSalesCreated(entity);
    return entity;
  }

  async getById(id) {
    return salesCache.remember(`id:${id}`, 120, async () => {
      const entity = await salesRepo.findById(id);
      if (!entity) throw ApiError.notFound('Sales not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return salesCache.remember(cacheKey, 60, () => salesRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await salesRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Sales not found');
    await salesCache.forget(`id:${id}`);
    await salesCache.flushNamespace();
    publishSalesUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await salesRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Sales not found');
    await salesCache.forget(`id:${id}`);
    await salesCache.flushNamespace();
    publishSalesDeleted(id);
    return entity;
  }
}

module.exports = new SalesService();
