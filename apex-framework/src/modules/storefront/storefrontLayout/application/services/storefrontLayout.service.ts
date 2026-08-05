const storefrontLayoutRepo = require('../../domain/repositories/storefrontLayout.repository');
const storefrontLayoutCache = require('../../cache/storefrontLayout.cache');
const {
  publishStorefrontLayoutCreated,
  publishStorefrontLayoutUpdated,
  publishStorefrontLayoutDeleted,
} = require('../../events/storefrontLayout.events');
const ApiError = require('../../../../../core/ApiError');

class StorefrontLayoutService {
  async create(data) {
    const entity = await storefrontLayoutRepo.create(data);
    await storefrontLayoutCache.flushNamespace();
    publishStorefrontLayoutCreated(entity);
    return entity;
  }

  async getById(id) {
    return storefrontLayoutCache.remember(`id:${id}`, 120, async () => {
      const entity = await storefrontLayoutRepo.findById(id);
      if (!entity) throw ApiError.notFound('StorefrontLayout not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return storefrontLayoutCache.remember(cacheKey, 60, () => storefrontLayoutRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await storefrontLayoutRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('StorefrontLayout not found');
    await storefrontLayoutCache.forget(`id:${id}`);
    await storefrontLayoutCache.flushNamespace();
    publishStorefrontLayoutUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await storefrontLayoutRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('StorefrontLayout not found');
    await storefrontLayoutCache.forget(`id:${id}`);
    await storefrontLayoutCache.flushNamespace();
    publishStorefrontLayoutDeleted(id);
    return entity;
  }
}

module.exports = new StorefrontLayoutService();
