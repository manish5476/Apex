const platformAuditRepo = require('../../domain/repositories/platformAudit.repository');
const platformAuditCache = require('../../cache/platformAudit.cache');
const {
  publishPlatformAuditCreated,
  publishPlatformAuditUpdated,
  publishPlatformAuditDeleted,
} = require('../../events/platformAudit.events');
const ApiError = require('../../../../../core/ApiError');

class PlatformAuditService {
  async create(data) {
    const entity = await platformAuditRepo.create(data);
    await platformAuditCache.flushNamespace();
    publishPlatformAuditCreated(entity);
    return entity;
  }

  async getById(id) {
    return platformAuditCache.remember(`id:${id}`, 120, async () => {
      const entity = await platformAuditRepo.findById(id);
      if (!entity) throw ApiError.notFound('PlatformAudit not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return platformAuditCache.remember(cacheKey, 60, () => platformAuditRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await platformAuditRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('PlatformAudit not found');
    await platformAuditCache.forget(`id:${id}`);
    await platformAuditCache.flushNamespace();
    publishPlatformAuditUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await platformAuditRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('PlatformAudit not found');
    await platformAuditCache.forget(`id:${id}`);
    await platformAuditCache.flushNamespace();
    publishPlatformAuditDeleted(id);
    return entity;
  }
}

module.exports = new PlatformAuditService();
