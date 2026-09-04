const organizationProfileRepo = require('../../domain/repositories/organizationProfile.repository');
const organizationProfileCache = require('../../cache/organizationProfile.cache');
const {
  publishOrganizationProfileCreated,
  publishOrganizationProfileUpdated,
  publishOrganizationProfileDeleted,
} = require('../../events/organizationProfile.events');
const ApiError = require('../../../../../core/ApiError');

class OrganizationProfileService {
  async create(data) {
    const entity = await organizationProfileRepo.create(data);
    await organizationProfileCache.flushNamespace();
    publishOrganizationProfileCreated(entity);
    return entity;
  }

  async getById(id) {
    return organizationProfileCache.remember(`id:${id}`, 120, async () => {
      const entity = await organizationProfileRepo.findById(id);
      if (!entity) throw ApiError.notFound('OrganizationProfile not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return organizationProfileCache.remember(cacheKey, 60, () => organizationProfileRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await organizationProfileRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('OrganizationProfile not found');
    await organizationProfileCache.forget(`id:${id}`);
    await organizationProfileCache.flushNamespace();
    publishOrganizationProfileUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await organizationProfileRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('OrganizationProfile not found');
    await organizationProfileCache.forget(`id:${id}`);
    await organizationProfileCache.flushNamespace();
    publishOrganizationProfileDeleted(id);
    return entity;
  }
}

module.exports = new OrganizationProfileService();
