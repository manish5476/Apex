const storefrontCustomerRepo = require('../../domain/repositories/storefrontCustomer.repository');
const storefrontCustomerCache = require('../../cache/storefrontCustomer.cache');
const {
  publishStorefrontCustomerCreated,
  publishStorefrontCustomerUpdated,
  publishStorefrontCustomerDeleted,
} = require('../../events/storefrontCustomer.events');
const ApiError = require('../../../../../core/ApiError');

class StorefrontCustomerService {
  async create(data) {
    const entity = await storefrontCustomerRepo.create(data);
    await storefrontCustomerCache.flushNamespace();
    publishStorefrontCustomerCreated(entity);
    return entity;
  }

  async getById(id) {
    return storefrontCustomerCache.remember(`id:${id}`, 120, async () => {
      const entity = await storefrontCustomerRepo.findById(id);
      if (!entity) throw ApiError.notFound('StorefrontCustomer not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return storefrontCustomerCache.remember(cacheKey, 60, () => storefrontCustomerRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await storefrontCustomerRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('StorefrontCustomer not found');
    await storefrontCustomerCache.forget(`id:${id}`);
    await storefrontCustomerCache.flushNamespace();
    publishStorefrontCustomerUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await storefrontCustomerRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('StorefrontCustomer not found');
    await storefrontCustomerCache.forget(`id:${id}`);
    await storefrontCustomerCache.flushNamespace();
    publishStorefrontCustomerDeleted(id);
    return entity;
  }
}

module.exports = new StorefrontCustomerService();
