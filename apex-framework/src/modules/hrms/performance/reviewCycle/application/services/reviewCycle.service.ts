const reviewCycleRepo = require('../../domain/repositories/reviewCycle.repository');
const reviewCycleCache = require('../../cache/reviewCycle.cache');
const {
  publishReviewCycleCreated,
  publishReviewCycleUpdated,
  publishReviewCycleDeleted,
} = require('../../events/reviewCycle.events');
const ApiError = require('../../../../../../core/ApiError');

class ReviewCycleService {
  async create(data) {
    const entity = await reviewCycleRepo.create(data);
    await reviewCycleCache.flushNamespace();
    publishReviewCycleCreated(entity);
    return entity;
  }

  async getById(id) {
    return reviewCycleCache.remember(`id:${id}`, 120, async () => {
      const entity = await reviewCycleRepo.findById(id);
      if (!entity) throw ApiError.notFound('ReviewCycle not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return reviewCycleCache.remember(cacheKey, 60, () => reviewCycleRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await reviewCycleRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('ReviewCycle not found');
    await reviewCycleCache.forget(`id:${id}`);
    await reviewCycleCache.flushNamespace();
    publishReviewCycleUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await reviewCycleRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('ReviewCycle not found');
    await reviewCycleCache.forget(`id:${id}`);
    await reviewCycleCache.flushNamespace();
    publishReviewCycleDeleted(id);
    return entity;
  }
}

module.exports = new ReviewCycleService();
