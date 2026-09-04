const messageRepo = require('../../domain/repositories/message.repository');
const messageCache = require('../../cache/message.cache');
const {
  publishMessageCreated,
  publishMessageUpdated,
  publishMessageDeleted,
} = require('../../events/message.events');
const ApiError = require('../../../../../core/ApiError');

class MessageService {
  async create(data) {
    const entity = await messageRepo.create(data);
    await messageCache.flushNamespace();
    publishMessageCreated(entity);
    return entity;
  }

  async getById(id) {
    return messageCache.remember(`id:${id}`, 120, async () => {
      const entity = await messageRepo.findById(id);
      if (!entity) throw ApiError.notFound('Message not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return messageCache.remember(cacheKey, 60, () => messageRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await messageRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Message not found');
    await messageCache.forget(`id:${id}`);
    await messageCache.flushNamespace();
    publishMessageUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await messageRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Message not found');
    await messageCache.forget(`id:${id}`);
    await messageCache.flushNamespace();
    publishMessageDeleted(id);
    return entity;
  }
}

module.exports = new MessageService();
