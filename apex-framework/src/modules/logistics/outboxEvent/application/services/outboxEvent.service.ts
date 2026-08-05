const outboxEventRepo = require('../../domain/repositories/outboxEvent.repository');
const outboxEventCache = require('../../cache/outboxEvent.cache');
const {
  publishOutboxEventCreated,
  publishOutboxEventUpdated,
  publishOutboxEventDeleted,
} = require('../../events/outboxEvent.events');
const ApiError = require('../../../../../core/ApiError');

class OutboxEventService {
  async create(data) {
    const entity = await outboxEventRepo.create(data);
    await outboxEventCache.flushNamespace();
    publishOutboxEventCreated(entity);
    return entity;
  }

  async getById(id) {
    return outboxEventCache.remember(`id:${id}`, 120, async () => {
      const entity = await outboxEventRepo.findById(id);
      if (!entity) throw ApiError.notFound('OutboxEvent not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return outboxEventCache.remember(cacheKey, 60, () => outboxEventRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await outboxEventRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('OutboxEvent not found');
    await outboxEventCache.forget(`id:${id}`);
    await outboxEventCache.flushNamespace();
    publishOutboxEventUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await outboxEventRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('OutboxEvent not found');
    await outboxEventCache.forget(`id:${id}`);
    await outboxEventCache.flushNamespace();
    publishOutboxEventDeleted(id);
    return entity;
  }
}

module.exports = new OutboxEventService();
