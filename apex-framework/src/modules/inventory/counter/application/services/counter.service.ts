const counterRepo = require('../../domain/repositories/counter.repository');
const counterCache = require('../../cache/counter.cache');
const {
  publishCounterCreated,
  publishCounterUpdated,
  publishCounterDeleted,
} = require('../../events/counter.events');
const ApiError = require('../../../../../core/ApiError');

class CounterService {
  async create(data) {
    const entity = await counterRepo.create(data);
    await counterCache.flushNamespace();
    publishCounterCreated(entity);
    return entity;
  }

  async getById(id) {
    return counterCache.remember(`id:${id}`, 120, async () => {
      const entity = await counterRepo.findById(id);
      if (!entity) throw ApiError.notFound('Counter not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return counterCache.remember(cacheKey, 60, () => counterRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await counterRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Counter not found');
    await counterCache.forget(`id:${id}`);
    await counterCache.flushNamespace();
    publishCounterUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await counterRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Counter not found');
    await counterCache.forget(`id:${id}`);
    await counterCache.flushNamespace();
    publishCounterDeleted(id);
    return entity;
  }
}

module.exports = new CounterService();
