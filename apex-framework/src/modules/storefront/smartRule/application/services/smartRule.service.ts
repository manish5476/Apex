const smartRuleRepo = require('../../domain/repositories/smartRule.repository');
const smartRuleCache = require('../../cache/smartRule.cache');
const {
  publishSmartRuleCreated,
  publishSmartRuleUpdated,
  publishSmartRuleDeleted,
} = require('../../events/smartRule.events');
const ApiError = require('../../../../../core/ApiError');

class SmartRuleService {
  async create(data) {
    const entity = await smartRuleRepo.create(data);
    await smartRuleCache.flushNamespace();
    publishSmartRuleCreated(entity);
    return entity;
  }

  async getById(id) {
    return smartRuleCache.remember(`id:${id}`, 120, async () => {
      const entity = await smartRuleRepo.findById(id);
      if (!entity) throw ApiError.notFound('SmartRule not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return smartRuleCache.remember(cacheKey, 60, () => smartRuleRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await smartRuleRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('SmartRule not found');
    await smartRuleCache.forget(`id:${id}`);
    await smartRuleCache.flushNamespace();
    publishSmartRuleUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await smartRuleRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('SmartRule not found');
    await smartRuleCache.forget(`id:${id}`);
    await smartRuleCache.flushNamespace();
    publishSmartRuleDeleted(id);
    return entity;
  }
}

module.exports = new SmartRuleService();
