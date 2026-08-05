const storefrontFormSubmissionRepo = require('../../domain/repositories/storefrontFormSubmission.repository');
const storefrontFormSubmissionCache = require('../../cache/storefrontFormSubmission.cache');
const {
  publishStorefrontFormSubmissionCreated,
  publishStorefrontFormSubmissionUpdated,
  publishStorefrontFormSubmissionDeleted,
} = require('../../events/storefrontFormSubmission.events');
const ApiError = require('../../../../../core/ApiError');

class StorefrontFormSubmissionService {
  async create(data) {
    const entity = await storefrontFormSubmissionRepo.create(data);
    await storefrontFormSubmissionCache.flushNamespace();
    publishStorefrontFormSubmissionCreated(entity);
    return entity;
  }

  async getById(id) {
    return storefrontFormSubmissionCache.remember(`id:${id}`, 120, async () => {
      const entity = await storefrontFormSubmissionRepo.findById(id);
      if (!entity) throw ApiError.notFound('StorefrontFormSubmission not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return storefrontFormSubmissionCache.remember(cacheKey, 60, () => storefrontFormSubmissionRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await storefrontFormSubmissionRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('StorefrontFormSubmission not found');
    await storefrontFormSubmissionCache.forget(`id:${id}`);
    await storefrontFormSubmissionCache.flushNamespace();
    publishStorefrontFormSubmissionUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await storefrontFormSubmissionRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('StorefrontFormSubmission not found');
    await storefrontFormSubmissionCache.forget(`id:${id}`);
    await storefrontFormSubmissionCache.flushNamespace();
    publishStorefrontFormSubmissionDeleted(id);
    return entity;
  }
}

module.exports = new StorefrontFormSubmissionService();
