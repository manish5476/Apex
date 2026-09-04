const storefrontCustomerAddressRepo = require('../../domain/repositories/storefrontCustomerAddress.repository');
const storefrontCustomerAddressCache = require('../../cache/storefrontCustomerAddress.cache');
const {
  publishStorefrontCustomerAddressCreated,
  publishStorefrontCustomerAddressUpdated,
  publishStorefrontCustomerAddressDeleted,
} = require('../../events/storefrontCustomerAddress.events');
const ApiError = require('../../../../../core/ApiError');

class StorefrontCustomerAddressService {
  async create(data) {
    const entity = await storefrontCustomerAddressRepo.create(data);
    await storefrontCustomerAddressCache.flushNamespace();
    publishStorefrontCustomerAddressCreated(entity);
    return entity;
  }

  async getById(id) {
    return storefrontCustomerAddressCache.remember(`id:${id}`, 120, async () => {
      const entity = await storefrontCustomerAddressRepo.findById(id);
      if (!entity) throw ApiError.notFound('StorefrontCustomerAddress not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return storefrontCustomerAddressCache.remember(cacheKey, 60, () => storefrontCustomerAddressRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await storefrontCustomerAddressRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('StorefrontCustomerAddress not found');
    await storefrontCustomerAddressCache.forget(`id:${id}`);
    await storefrontCustomerAddressCache.flushNamespace();
    publishStorefrontCustomerAddressUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await storefrontCustomerAddressRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('StorefrontCustomerAddress not found');
    await storefrontCustomerAddressCache.forget(`id:${id}`);
    await storefrontCustomerAddressCache.flushNamespace();
    publishStorefrontCustomerAddressDeleted(id);
    return entity;
  }
}

module.exports = new StorefrontCustomerAddressService();
