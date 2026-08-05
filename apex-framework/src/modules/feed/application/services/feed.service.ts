const feedRepo = require('../../domain/repositories/feed.repository');
const feedCache = require('../../cache/feed.cache');
const {
  publishFeedCreated,
  publishFeedUpdated,
  publishFeedDeleted,
} = require('../../events/feed.events');
const ApiError = require('../../../../core/ApiError');

class FeedService {
  async create(data) {
    const entity = await feedRepo.create(data);
    await feedCache.flushNamespace();
    publishFeedCreated(entity);
    return entity;
  }

  async getById(id) {
    return feedCache.remember(`id:${id}`, 120, async () => {
      const entity = await feedRepo.findById(id);
      if (!entity) throw ApiError.notFound('Feed not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return feedCache.remember(cacheKey, 60, () => feedRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await feedRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Feed not found');
    await feedCache.forget(`id:${id}`);
    await feedCache.flushNamespace();
    publishFeedUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await feedRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Feed not found');
    await feedCache.forget(`id:${id}`);
    await feedCache.flushNamespace();
    publishFeedDeleted(id);
    return entity;
  }
}

module.exports = new FeedService();
