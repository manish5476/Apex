const storefrontSessionRepo = require('../../domain/repositories/storefrontSession.repository');
const storefrontSessionCache = require('../../cache/storefrontSession.cache');
const {
  publishStorefrontSessionCreated,
  publishStorefrontSessionUpdated,
  publishStorefrontSessionDeleted,
} = require('../../events/storefrontSession.events');
const ApiError = require('../../../../../core/ApiError');

class StorefrontSessionService {
  async create(data) {
    const entity = await storefrontSessionRepo.create(data);
    await storefrontSessionCache.flushNamespace();
    publishStorefrontSessionCreated(entity);
    return entity;
  }

  async getById(id) {
    return storefrontSessionCache.remember(`id:${id}`, 120, async () => {
      const entity = await storefrontSessionRepo.findById(id);
      if (!entity) throw ApiError.notFound('StorefrontSession not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return storefrontSessionCache.remember(cacheKey, 60, () => storefrontSessionRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await storefrontSessionRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('StorefrontSession not found');
    await storefrontSessionCache.forget(`id:${id}`);
    await storefrontSessionCache.flushNamespace();
    publishStorefrontSessionUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await storefrontSessionRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('StorefrontSession not found');
    await storefrontSessionCache.forget(`id:${id}`);
    await storefrontSessionCache.flushNamespace();
    publishStorefrontSessionDeleted(id);
    return entity;
  }
}

module.exports = new StorefrontSessionService();
