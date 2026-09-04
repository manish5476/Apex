const salesReturnRepo = require('../../domain/repositories/salesReturn.repository');
const salesReturnCache = require('../../cache/salesReturn.cache');
const {
  publishSalesReturnCreated,
  publishSalesReturnUpdated,
  publishSalesReturnDeleted,
} = require('../../events/salesReturn.events');
const ApiError = require('../../../../../core/ApiError');

class SalesReturnService {
  async create(data) {
    const entity = await salesReturnRepo.create(data);
    await salesReturnCache.flushNamespace();
    publishSalesReturnCreated(entity);
    return entity;
  }

  async getById(id) {
    return salesReturnCache.remember(`id:${id}`, 120, async () => {
      const entity = await salesReturnRepo.findById(id);
      if (!entity) throw ApiError.notFound('SalesReturn not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return salesReturnCache.remember(cacheKey, 60, () => salesReturnRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await salesReturnRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('SalesReturn not found');
    await salesReturnCache.forget(`id:${id}`);
    await salesReturnCache.flushNamespace();
    publishSalesReturnUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await salesReturnRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('SalesReturn not found');
    await salesReturnCache.forget(`id:${id}`);
    await salesReturnCache.flushNamespace();
    publishSalesReturnDeleted(id);
    return entity;
  }
}

module.exports = new SalesReturnService();
