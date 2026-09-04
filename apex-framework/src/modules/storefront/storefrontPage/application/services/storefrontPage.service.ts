const storefrontPageRepo = require('../../domain/repositories/storefrontPage.repository');
const storefrontPageCache = require('../../cache/storefrontPage.cache');
const {
  publishStorefrontPageCreated,
  publishStorefrontPageUpdated,
  publishStorefrontPageDeleted,
} = require('../../events/storefrontPage.events');
const ApiError = require('../../../../../core/ApiError');

class StorefrontPageService {
  async create(data) {
    const entity = await storefrontPageRepo.create(data);
    await storefrontPageCache.flushNamespace();
    publishStorefrontPageCreated(entity);
    return entity;
  }

  async getById(id) {
    return storefrontPageCache.remember(`id:${id}`, 120, async () => {
      const entity = await storefrontPageRepo.findById(id);
      if (!entity) throw ApiError.notFound('StorefrontPage not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return storefrontPageCache.remember(cacheKey, 60, () => storefrontPageRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await storefrontPageRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('StorefrontPage not found');
    await storefrontPageCache.forget(`id:${id}`);
    await storefrontPageCache.flushNamespace();
    publishStorefrontPageUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await storefrontPageRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('StorefrontPage not found');
    await storefrontPageCache.forget(`id:${id}`);
    await storefrontPageCache.flushNamespace();
    publishStorefrontPageDeleted(id);
    return entity;
  }
}

module.exports = new StorefrontPageService();
