const storefrontDeliveryAgentRepo = require('../../domain/repositories/storefrontDeliveryAgent.repository');
const storefrontDeliveryAgentCache = require('../../cache/storefrontDeliveryAgent.cache');
const {
  publishStorefrontDeliveryAgentCreated,
  publishStorefrontDeliveryAgentUpdated,
  publishStorefrontDeliveryAgentDeleted,
} = require('../../events/storefrontDeliveryAgent.events');
const ApiError = require('../../../../../core/ApiError');

class StorefrontDeliveryAgentService {
  async create(data) {
    const entity = await storefrontDeliveryAgentRepo.create(data);
    await storefrontDeliveryAgentCache.flushNamespace();
    publishStorefrontDeliveryAgentCreated(entity);
    return entity;
  }

  async getById(id) {
    return storefrontDeliveryAgentCache.remember(`id:${id}`, 120, async () => {
      const entity = await storefrontDeliveryAgentRepo.findById(id);
      if (!entity) throw ApiError.notFound('StorefrontDeliveryAgent not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return storefrontDeliveryAgentCache.remember(cacheKey, 60, () => storefrontDeliveryAgentRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await storefrontDeliveryAgentRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('StorefrontDeliveryAgent not found');
    await storefrontDeliveryAgentCache.forget(`id:${id}`);
    await storefrontDeliveryAgentCache.flushNamespace();
    publishStorefrontDeliveryAgentUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await storefrontDeliveryAgentRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('StorefrontDeliveryAgent not found');
    await storefrontDeliveryAgentCache.forget(`id:${id}`);
    await storefrontDeliveryAgentCache.flushNamespace();
    publishStorefrontDeliveryAgentDeleted(id);
    return entity;
  }
}

module.exports = new StorefrontDeliveryAgentService();
