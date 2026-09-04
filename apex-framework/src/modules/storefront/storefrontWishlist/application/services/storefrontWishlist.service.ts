const storefrontWishlistRepo = require('../../domain/repositories/storefrontWishlist.repository');
const storefrontWishlistCache = require('../../cache/storefrontWishlist.cache');
const {
  publishStorefrontWishlistCreated,
  publishStorefrontWishlistUpdated,
  publishStorefrontWishlistDeleted,
} = require('../../events/storefrontWishlist.events');
const ApiError = require('../../../../../core/ApiError');

class StorefrontWishlistService {
  async create(data) {
    const entity = await storefrontWishlistRepo.create(data);
    await storefrontWishlistCache.flushNamespace();
    publishStorefrontWishlistCreated(entity);
    return entity;
  }

  async getById(id) {
    return storefrontWishlistCache.remember(`id:${id}`, 120, async () => {
      const entity = await storefrontWishlistRepo.findById(id);
      if (!entity) throw ApiError.notFound('StorefrontWishlist not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return storefrontWishlistCache.remember(cacheKey, 60, () => storefrontWishlistRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await storefrontWishlistRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('StorefrontWishlist not found');
    await storefrontWishlistCache.forget(`id:${id}`);
    await storefrontWishlistCache.flushNamespace();
    publishStorefrontWishlistUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await storefrontWishlistRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('StorefrontWishlist not found');
    await storefrontWishlistCache.forget(`id:${id}`);
    await storefrontWishlistCache.flushNamespace();
    publishStorefrontWishlistDeleted(id);
    return entity;
  }
}

module.exports = new StorefrontWishlistService();
