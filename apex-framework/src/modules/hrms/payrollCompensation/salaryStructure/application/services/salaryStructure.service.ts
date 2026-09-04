const salaryStructureRepo = require('../../domain/repositories/salaryStructure.repository');
const salaryStructureCache = require('../../cache/salaryStructure.cache');
const {
  publishSalaryStructureCreated,
  publishSalaryStructureUpdated,
  publishSalaryStructureDeleted,
} = require('../../events/salaryStructure.events');
const ApiError = require('../../../../../../core/ApiError');

class SalaryStructureService {
  async create(data) {
    const entity = await salaryStructureRepo.create(data);
    await salaryStructureCache.flushNamespace();
    publishSalaryStructureCreated(entity);
    return entity;
  }

  async getById(id) {
    return salaryStructureCache.remember(`id:${id}`, 120, async () => {
      const entity = await salaryStructureRepo.findById(id);
      if (!entity) throw ApiError.notFound('SalaryStructure not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return salaryStructureCache.remember(cacheKey, 60, () => salaryStructureRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await salaryStructureRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('SalaryStructure not found');
    await salaryStructureCache.forget(`id:${id}`);
    await salaryStructureCache.flushNamespace();
    publishSalaryStructureUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await salaryStructureRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('SalaryStructure not found');
    await salaryStructureCache.forget(`id:${id}`);
    await salaryStructureCache.flushNamespace();
    publishSalaryStructureDeleted(id);
    return entity;
  }
}

module.exports = new SalaryStructureService();
