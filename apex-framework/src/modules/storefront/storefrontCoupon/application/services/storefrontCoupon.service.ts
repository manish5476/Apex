const storefrontCouponRepo = require('../../domain/repositories/storefrontCoupon.repository');
const storefrontCouponCache = require('../../cache/storefrontCoupon.cache');
const {
  publishStorefrontCouponCreated,
  publishStorefrontCouponUpdated,
  publishStorefrontCouponDeleted,
} = require('../../events/storefrontCoupon.events');
const ApiError = require('../../../../../core/ApiError');

class StorefrontCouponService {
  async create(data) {
    const entity = await storefrontCouponRepo.create(data);
    await storefrontCouponCache.flushNamespace();
    publishStorefrontCouponCreated(entity);
    return entity;
  }

  async getById(id) {
    return storefrontCouponCache.remember(`id:${id}`, 120, async () => {
      const entity = await storefrontCouponRepo.findById(id);
      if (!entity) throw ApiError.notFound('StorefrontCoupon not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return storefrontCouponCache.remember(cacheKey, 60, () => storefrontCouponRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await storefrontCouponRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('StorefrontCoupon not found');
    await storefrontCouponCache.forget(`id:${id}`);
    await storefrontCouponCache.flushNamespace();
    publishStorefrontCouponUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await storefrontCouponRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('StorefrontCoupon not found');
    await storefrontCouponCache.forget(`id:${id}`);
    await storefrontCouponCache.flushNamespace();
    publishStorefrontCouponDeleted(id);
    return entity;
  }
}

module.exports = new StorefrontCouponService();
