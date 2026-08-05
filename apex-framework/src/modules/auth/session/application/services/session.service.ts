const sessionRepo = require('../../domain/repositories/session.repository');
const sessionCache = require('../../cache/session.cache');
const {
  publishSessionCreated,
  publishSessionUpdated,
  publishSessionDeleted,
} = require('../../events/session.events');
const ApiError = require('../../../../../core/ApiError');

class SessionService {
  async create(data) {
    const entity = await sessionRepo.create(data);
    await sessionCache.flushNamespace();
    publishSessionCreated(entity);
    return entity;
  }

  async getById(id) {
    return sessionCache.remember(`id:${id}`, 120, async () => {
      const entity = await sessionRepo.findById(id);
      if (!entity) throw ApiError.notFound('Session not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return sessionCache.remember(cacheKey, 60, () => sessionRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await sessionRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Session not found');
    await sessionCache.forget(`id:${id}`);
    await sessionCache.flushNamespace();
    publishSessionUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await sessionRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Session not found');
    await sessionCache.forget(`id:${id}`);
    await sessionCache.flushNamespace();
    publishSessionDeleted(id);
    return entity;
  }
}

module.exports = new SessionService();
