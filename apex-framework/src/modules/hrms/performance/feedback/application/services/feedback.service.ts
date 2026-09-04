const feedbackRepo = require('../../domain/repositories/feedback.repository');
const feedbackCache = require('../../cache/feedback.cache');
const {
  publishFeedbackCreated,
  publishFeedbackUpdated,
  publishFeedbackDeleted,
} = require('../../events/feedback.events');
const ApiError = require('../../../../../../core/ApiError');

class FeedbackService {
  async create(data) {
    const entity = await feedbackRepo.create(data);
    await feedbackCache.flushNamespace();
    publishFeedbackCreated(entity);
    return entity;
  }

  async getById(id) {
    return feedbackCache.remember(`id:${id}`, 120, async () => {
      const entity = await feedbackRepo.findById(id);
      if (!entity) throw ApiError.notFound('Feedback not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return feedbackCache.remember(cacheKey, 60, () => feedbackRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await feedbackRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Feedback not found');
    await feedbackCache.forget(`id:${id}`);
    await feedbackCache.flushNamespace();
    publishFeedbackUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await feedbackRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Feedback not found');
    await feedbackCache.forget(`id:${id}`);
    await feedbackCache.flushNamespace();
    publishFeedbackDeleted(id);
    return entity;
  }
}

module.exports = new FeedbackService();
