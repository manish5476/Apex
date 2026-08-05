const pendingReconciliationRepo = require('../../domain/repositories/pendingReconciliation.repository');
const pendingReconciliationCache = require('../../cache/pendingReconciliation.cache');
const {
  publishPendingReconciliationCreated,
  publishPendingReconciliationUpdated,
  publishPendingReconciliationDeleted,
} = require('../../events/pendingReconciliation.events');
const ApiError = require('../../../../../../core/ApiError');

class PendingReconciliationService {
  async create(data) {
    const entity = await pendingReconciliationRepo.create(data);
    await pendingReconciliationCache.flushNamespace();
    publishPendingReconciliationCreated(entity);
    return entity;
  }

  async getById(id) {
    return pendingReconciliationCache.remember(`id:${id}`, 120, async () => {
      const entity = await pendingReconciliationRepo.findById(id);
      if (!entity) throw ApiError.notFound('PendingReconciliation not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return pendingReconciliationCache.remember(cacheKey, 60, () => pendingReconciliationRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await pendingReconciliationRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('PendingReconciliation not found');
    await pendingReconciliationCache.forget(`id:${id}`);
    await pendingReconciliationCache.flushNamespace();
    publishPendingReconciliationUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await pendingReconciliationRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('PendingReconciliation not found');
    await pendingReconciliationCache.forget(`id:${id}`);
    await pendingReconciliationCache.flushNamespace();
    publishPendingReconciliationDeleted(id);
    return entity;
  }
}

module.exports = new PendingReconciliationService();
