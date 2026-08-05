const taxDeductionRepo = require('../../domain/repositories/taxDeduction.repository');
const taxDeductionCache = require('../../cache/taxDeduction.cache');
const {
  publishTaxDeductionCreated,
  publishTaxDeductionUpdated,
  publishTaxDeductionDeleted,
} = require('../../events/taxDeduction.events');
const ApiError = require('../../../../../../core/ApiError');

class TaxDeductionService {
  async create(data) {
    const entity = await taxDeductionRepo.create(data);
    await taxDeductionCache.flushNamespace();
    publishTaxDeductionCreated(entity);
    return entity;
  }

  async getById(id) {
    return taxDeductionCache.remember(`id:${id}`, 120, async () => {
      const entity = await taxDeductionRepo.findById(id);
      if (!entity) throw ApiError.notFound('TaxDeduction not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return taxDeductionCache.remember(cacheKey, 60, () => taxDeductionRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await taxDeductionRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('TaxDeduction not found');
    await taxDeductionCache.forget(`id:${id}`);
    await taxDeductionCache.flushNamespace();
    publishTaxDeductionUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await taxDeductionRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('TaxDeduction not found');
    await taxDeductionCache.forget(`id:${id}`);
    await taxDeductionCache.flushNamespace();
    publishTaxDeductionDeleted(id);
    return entity;
  }
}

module.exports = new TaxDeductionService();
