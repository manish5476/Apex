const webhookCoreRepo = require('../../domain/repositories/webhookCore.repository');
const webhookCoreCache = require('../../cache/webhookCore.cache');
const {
  publishWebhookCoreCreated,
  publishWebhookCoreUpdated,
  publishWebhookCoreDeleted,
} = require('../../events/webhookCore.events');
const ApiError = require('../../../../../core/ApiError');

class WebhookCoreService {
  async create(data) {
    const entity = await webhookCoreRepo.create(data);
    await webhookCoreCache.flushNamespace();
    publishWebhookCoreCreated(entity);
    return entity;
  }

  async getById(id) {
    return webhookCoreCache.remember(`id:${id}`, 120, async () => {
      const entity = await webhookCoreRepo.findById(id);
      if (!entity) throw ApiError.notFound('WebhookCore not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return webhookCoreCache.remember(cacheKey, 60, () => webhookCoreRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await webhookCoreRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('WebhookCore not found');
    await webhookCoreCache.forget(`id:${id}`);
    await webhookCoreCache.flushNamespace();
    publishWebhookCoreUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await webhookCoreRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('WebhookCore not found');
    await webhookCoreCache.forget(`id:${id}`);
    await webhookCoreCache.flushNamespace();
    publishWebhookCoreDeleted(id);
    return entity;
  }
}

module.exports = new WebhookCoreService();
