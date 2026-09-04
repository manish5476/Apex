const globalDeliveryPartnerRepo = require('../../domain/repositories/globalDeliveryPartner.repository');
const globalDeliveryPartnerCache = require('../../cache/globalDeliveryPartner.cache');
const {
  publishGlobalDeliveryPartnerCreated,
  publishGlobalDeliveryPartnerUpdated,
  publishGlobalDeliveryPartnerDeleted,
} = require('../../events/globalDeliveryPartner.events');
const ApiError = require('../../../../../core/ApiError');

class GlobalDeliveryPartnerService {
  async create(data) {
    const entity = await globalDeliveryPartnerRepo.create(data);
    await globalDeliveryPartnerCache.flushNamespace();
    publishGlobalDeliveryPartnerCreated(entity);
    return entity;
  }

  async getById(id) {
    return globalDeliveryPartnerCache.remember(`id:${id}`, 120, async () => {
      const entity = await globalDeliveryPartnerRepo.findById(id);
      if (!entity) throw ApiError.notFound('GlobalDeliveryPartner not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return globalDeliveryPartnerCache.remember(cacheKey, 60, () => globalDeliveryPartnerRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await globalDeliveryPartnerRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('GlobalDeliveryPartner not found');
    await globalDeliveryPartnerCache.forget(`id:${id}`);
    await globalDeliveryPartnerCache.flushNamespace();
    publishGlobalDeliveryPartnerUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await globalDeliveryPartnerRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('GlobalDeliveryPartner not found');
    await globalDeliveryPartnerCache.forget(`id:${id}`);
    await globalDeliveryPartnerCache.flushNamespace();
    publishGlobalDeliveryPartnerDeleted(id);
    return entity;
  }
}

module.exports = new GlobalDeliveryPartnerService();
