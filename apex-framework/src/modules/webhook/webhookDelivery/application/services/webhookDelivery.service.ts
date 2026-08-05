const webhookDeliveryRepo = require('../../domain/repositories/webhookDelivery.repository');
const webhookDeliveryCache = require('../../cache/webhookDelivery.cache');
const {
  publishWebhookDeliveryCreated,
  publishWebhookDeliveryUpdated,
  publishWebhookDeliveryDeleted,
} = require('../../events/webhookDelivery.events');
const ApiError = require('../../../../../core/ApiError');

class WebhookDeliveryService {
  async create(data) {
    const entity = await webhookDeliveryRepo.create(data);
    await webhookDeliveryCache.flushNamespace();
    publishWebhookDeliveryCreated(entity);
    return entity;
  }

  async getById(id) {
    return webhookDeliveryCache.remember(`id:${id}`, 120, async () => {
      const entity = await webhookDeliveryRepo.findById(id);
      if (!entity) throw ApiError.notFound('WebhookDelivery not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return webhookDeliveryCache.remember(cacheKey, 60, () => webhookDeliveryRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await webhookDeliveryRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('WebhookDelivery not found');
    await webhookDeliveryCache.forget(`id:${id}`);
    await webhookDeliveryCache.flushNamespace();
    publishWebhookDeliveryUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await webhookDeliveryRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('WebhookDelivery not found');
    await webhookDeliveryCache.forget(`id:${id}`);
    await webhookDeliveryCache.flushNamespace();
    publishWebhookDeliveryDeleted(id);
    return entity;
  }
}

module.exports = new WebhookDeliveryService();
