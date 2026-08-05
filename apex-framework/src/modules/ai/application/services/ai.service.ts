const aiRepo = require('../../domain/repositories/ai.repository');
const aiCache = require('../../cache/ai.cache');
const {
  publishAiCreated,
  publishAiUpdated,
  publishAiDeleted,
} = require('../../events/ai.events');
const ApiError = require('../../../../core/ApiError');

class AiService {
  async create(data) {
    const entity = await aiRepo.create(data);
    await aiCache.flushNamespace();
    publishAiCreated(entity);
    return entity;
  }

  async getById(id) {
    return aiCache.remember(`id:${id}`, 120, async () => {
      const entity = await aiRepo.findById(id);
      if (!entity) throw ApiError.notFound('Ai not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return aiCache.remember(cacheKey, 60, () => aiRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await aiRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Ai not found');
    await aiCache.forget(`id:${id}`);
    await aiCache.flushNamespace();
    publishAiUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await aiRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Ai not found');
    await aiCache.forget(`id:${id}`);
    await aiCache.flushNamespace();
    publishAiDeleted(id);
    return entity;
  }
}

module.exports = new AiService();
