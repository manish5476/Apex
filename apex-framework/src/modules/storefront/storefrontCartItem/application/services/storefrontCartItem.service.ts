const storefrontCartItemRepo = require('../../domain/repositories/storefrontCartItem.repository');
const storefrontCartItemCache = require('../../cache/storefrontCartItem.cache');
const {
  publishStorefrontCartItemCreated,
  publishStorefrontCartItemUpdated,
  publishStorefrontCartItemDeleted,
} = require('../../events/storefrontCartItem.events');
const ApiError = require('../../../../../core/ApiError');

class StorefrontCartItemService {
  async create(data) {
    const entity = await storefrontCartItemRepo.create(data);
    await storefrontCartItemCache.flushNamespace();
    publishStorefrontCartItemCreated(entity);
    return entity;
  }

  async getById(id) {
    return storefrontCartItemCache.remember(`id:${id}`, 120, async () => {
      const entity = await storefrontCartItemRepo.findById(id);
      if (!entity) throw ApiError.notFound('StorefrontCartItem not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return storefrontCartItemCache.remember(cacheKey, 60, () => storefrontCartItemRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await storefrontCartItemRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('StorefrontCartItem not found');
    await storefrontCartItemCache.forget(`id:${id}`);
    await storefrontCartItemCache.flushNamespace();
    publishStorefrontCartItemUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await storefrontCartItemRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('StorefrontCartItem not found');
    await storefrontCartItemCache.forget(`id:${id}`);
    await storefrontCartItemCache.flushNamespace();
    publishStorefrontCartItemDeleted(id);
    return entity;
  }
}

module.exports = new StorefrontCartItemService();
