const platformDeliveryAgentRepo = require('../../domain/repositories/platformDeliveryAgent.repository');
const platformDeliveryAgentCache = require('../../cache/platformDeliveryAgent.cache');
const {
  publishPlatformDeliveryAgentCreated,
  publishPlatformDeliveryAgentUpdated,
  publishPlatformDeliveryAgentDeleted,
} = require('../../events/platformDeliveryAgent.events');
const ApiError = require('../../../../../core/ApiError');

class PlatformDeliveryAgentService {
  async create(data) {
    const entity = await platformDeliveryAgentRepo.create(data);
    await platformDeliveryAgentCache.flushNamespace();
    publishPlatformDeliveryAgentCreated(entity);
    return entity;
  }

  async getById(id) {
    return platformDeliveryAgentCache.remember(`id:${id}`, 120, async () => {
      const entity = await platformDeliveryAgentRepo.findById(id);
      if (!entity) throw ApiError.notFound('PlatformDeliveryAgent not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return platformDeliveryAgentCache.remember(cacheKey, 60, () => platformDeliveryAgentRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await platformDeliveryAgentRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('PlatformDeliveryAgent not found');
    await platformDeliveryAgentCache.forget(`id:${id}`);
    await platformDeliveryAgentCache.flushNamespace();
    publishPlatformDeliveryAgentUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await platformDeliveryAgentRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('PlatformDeliveryAgent not found');
    await platformDeliveryAgentCache.forget(`id:${id}`);
    await platformDeliveryAgentCache.flushNamespace();
    publishPlatformDeliveryAgentDeleted(id);
    return entity;
  }
}

module.exports = new PlatformDeliveryAgentService();
