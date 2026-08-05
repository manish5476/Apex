const purchaseReturnRepo = require('../../domain/repositories/purchaseReturn.repository');
const purchaseReturnCache = require('../../cache/purchaseReturn.cache');
const {
  publishPurchaseReturnCreated,
  publishPurchaseReturnUpdated,
  publishPurchaseReturnDeleted,
} = require('../../events/purchaseReturn.events');
const ApiError = require('../../../../../core/ApiError');

class PurchaseReturnService {
  async create(data) {
    const entity = await purchaseReturnRepo.create(data);
    await purchaseReturnCache.flushNamespace();
    publishPurchaseReturnCreated(entity);
    return entity;
  }

  async getById(id) {
    return purchaseReturnCache.remember(`id:${id}`, 120, async () => {
      const entity = await purchaseReturnRepo.findById(id);
      if (!entity) throw ApiError.notFound('PurchaseReturn not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return purchaseReturnCache.remember(cacheKey, 60, () => purchaseReturnRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await purchaseReturnRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('PurchaseReturn not found');
    await purchaseReturnCache.forget(`id:${id}`);
    await purchaseReturnCache.flushNamespace();
    publishPurchaseReturnUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await purchaseReturnRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('PurchaseReturn not found');
    await purchaseReturnCache.forget(`id:${id}`);
    await purchaseReturnCache.flushNamespace();
    publishPurchaseReturnDeleted(id);
    return entity;
  }
}

module.exports = new PurchaseReturnService();
