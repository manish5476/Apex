const purchaseRepo = require('../../domain/repositories/purchase.repository');
const purchaseCache = require('../../cache/purchase.cache');
const {
  publishPurchaseCreated,
  publishPurchaseUpdated,
  publishPurchaseDeleted,
} = require('../../events/purchase.events');
const ApiError = require('../../../../../core/ApiError');

class PurchaseService {
  async create(data) {
    const entity = await purchaseRepo.create(data);
    await purchaseCache.flushNamespace();
    publishPurchaseCreated(entity);
    return entity;
  }

  async getById(id) {
    return purchaseCache.remember(`id:${id}`, 120, async () => {
      const entity = await purchaseRepo.findById(id);
      if (!entity) throw ApiError.notFound('Purchase not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return purchaseCache.remember(cacheKey, 60, () => purchaseRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await purchaseRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Purchase not found');
    await purchaseCache.forget(`id:${id}`);
    await purchaseCache.flushNamespace();
    publishPurchaseUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await purchaseRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Purchase not found');
    await purchaseCache.forget(`id:${id}`);
    await purchaseCache.flushNamespace();
    publishPurchaseDeleted(id);
    return entity;
  }
}

module.exports = new PurchaseService();
