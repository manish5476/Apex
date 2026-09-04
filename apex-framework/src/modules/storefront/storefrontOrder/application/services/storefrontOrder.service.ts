const storefrontOrderRepo = require('../../domain/repositories/storefrontOrder.repository');
const storefrontOrderCache = require('../../cache/storefrontOrder.cache');
const {
  publishStorefrontOrderCreated,
  publishStorefrontOrderUpdated,
  publishStorefrontOrderDeleted,
} = require('../../events/storefrontOrder.events');
const ApiError = require('../../../../../core/ApiError');

class StorefrontOrderService {
  async create(data) {
    const entity = await storefrontOrderRepo.create(data);
    await storefrontOrderCache.flushNamespace();
    publishStorefrontOrderCreated(entity);
    return entity;
  }

  async getById(id) {
    return storefrontOrderCache.remember(`id:${id}`, 120, async () => {
      const entity = await storefrontOrderRepo.findById(id);
      if (!entity) throw ApiError.notFound('StorefrontOrder not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return storefrontOrderCache.remember(cacheKey, 60, () => storefrontOrderRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await storefrontOrderRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('StorefrontOrder not found');
    await storefrontOrderCache.forget(`id:${id}`);
    await storefrontOrderCache.flushNamespace();
    publishStorefrontOrderUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await storefrontOrderRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('StorefrontOrder not found');
    await storefrontOrderCache.forget(`id:${id}`);
    await storefrontOrderCache.flushNamespace();
    publishStorefrontOrderDeleted(id);
    return entity;
  }
}

module.exports = new StorefrontOrderService();
