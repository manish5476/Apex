const storefrontPageSnapshotRepo = require('../../domain/repositories/storefrontPageSnapshot.repository');
const storefrontPageSnapshotCache = require('../../cache/storefrontPageSnapshot.cache');
const {
  publishStorefrontPageSnapshotCreated,
  publishStorefrontPageSnapshotUpdated,
  publishStorefrontPageSnapshotDeleted,
} = require('../../events/storefrontPageSnapshot.events');
const ApiError = require('../../../../../core/ApiError');

class StorefrontPageSnapshotService {
  async create(data) {
    const entity = await storefrontPageSnapshotRepo.create(data);
    await storefrontPageSnapshotCache.flushNamespace();
    publishStorefrontPageSnapshotCreated(entity);
    return entity;
  }

  async getById(id) {
    return storefrontPageSnapshotCache.remember(`id:${id}`, 120, async () => {
      const entity = await storefrontPageSnapshotRepo.findById(id);
      if (!entity) throw ApiError.notFound('StorefrontPageSnapshot not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return storefrontPageSnapshotCache.remember(cacheKey, 60, () => storefrontPageSnapshotRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await storefrontPageSnapshotRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('StorefrontPageSnapshot not found');
    await storefrontPageSnapshotCache.forget(`id:${id}`);
    await storefrontPageSnapshotCache.flushNamespace();
    publishStorefrontPageSnapshotUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await storefrontPageSnapshotRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('StorefrontPageSnapshot not found');
    await storefrontPageSnapshotCache.forget(`id:${id}`);
    await storefrontPageSnapshotCache.flushNamespace();
    publishStorefrontPageSnapshotDeleted(id);
    return entity;
  }
}

module.exports = new StorefrontPageSnapshotService();
