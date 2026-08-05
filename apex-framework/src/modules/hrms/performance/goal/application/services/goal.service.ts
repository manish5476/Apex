const goalRepo = require('../../domain/repositories/goal.repository');
const goalCache = require('../../cache/goal.cache');
const {
  publishGoalCreated,
  publishGoalUpdated,
  publishGoalDeleted,
} = require('../../events/goal.events');
const ApiError = require('../../../../../../core/ApiError');

class GoalService {
  async create(data) {
    const entity = await goalRepo.create(data);
    await goalCache.flushNamespace();
    publishGoalCreated(entity);
    return entity;
  }

  async getById(id) {
    return goalCache.remember(`id:${id}`, 120, async () => {
      const entity = await goalRepo.findById(id);
      if (!entity) throw ApiError.notFound('Goal not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return goalCache.remember(cacheKey, 60, () => goalRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await goalRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Goal not found');
    await goalCache.forget(`id:${id}`);
    await goalCache.flushNamespace();
    publishGoalUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await goalRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Goal not found');
    await goalCache.forget(`id:${id}`);
    await goalCache.flushNamespace();
    publishGoalDeleted(id);
    return entity;
  }
}

module.exports = new GoalService();
