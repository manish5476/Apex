const storefrontCartRepo = require('../../domain/repositories/storefrontCart.repository');
const storefrontCartCache = require('../../cache/storefrontCart.cache');
const {
  publishStorefrontCartCreated,
  publishStorefrontCartUpdated,
  publishStorefrontCartDeleted,
} = require('../../events/storefrontCart.events');
const ApiError = require('../../../../../core/ApiError');

class StorefrontCartService {
  async create(data) {
    const entity = await storefrontCartRepo.create(data);
    await storefrontCartCache.flushNamespace();
    publishStorefrontCartCreated(entity);
    return entity;
  }

  async getById(id) {
    return storefrontCartCache.remember(`id:${id}`, 120, async () => {
      const entity = await storefrontCartRepo.findById(id);
      if (!entity) throw ApiError.notFound('StorefrontCart not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return storefrontCartCache.remember(cacheKey, 60, () => storefrontCartRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await storefrontCartRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('StorefrontCart not found');
    await storefrontCartCache.forget(`id:${id}`);
    await storefrontCartCache.flushNamespace();
    publishStorefrontCartUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await storefrontCartRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('StorefrontCart not found');
    await storefrontCartCache.forget(`id:${id}`);
    await storefrontCartCache.flushNamespace();
    publishStorefrontCartDeleted(id);
    return entity;
  }
}

module.exports = new StorefrontCartService();
