const providerActivationRepo = require('../../domain/repositories/providerActivation.repository');
const providerActivationCache = require('../../cache/providerActivation.cache');
const {
  publishProviderActivationCreated,
  publishProviderActivationUpdated,
  publishProviderActivationDeleted,
} = require('../../events/providerActivation.events');
const ApiError = require('../../../../../core/ApiError');

class ProviderActivationService {
  async create(data) {
    const entity = await providerActivationRepo.create(data);
    await providerActivationCache.flushNamespace();
    publishProviderActivationCreated(entity);
    return entity;
  }

  async getById(id) {
    return providerActivationCache.remember(`id:${id}`, 120, async () => {
      const entity = await providerActivationRepo.findById(id);
      if (!entity) throw ApiError.notFound('ProviderActivation not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return providerActivationCache.remember(cacheKey, 60, () => providerActivationRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await providerActivationRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('ProviderActivation not found');
    await providerActivationCache.forget(`id:${id}`);
    await providerActivationCache.flushNamespace();
    publishProviderActivationUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await providerActivationRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('ProviderActivation not found');
    await providerActivationCache.forget(`id:${id}`);
    await providerActivationCache.flushNamespace();
    publishProviderActivationDeleted(id);
    return entity;
  }
}

module.exports = new ProviderActivationService();
