const branchRepo = require('../../domain/repositories/branch.repository');
const branchCache = require('../../cache/branch.cache');
const {
  publishBranchCreated,
  publishBranchUpdated,
  publishBranchDeleted,
} = require('../../events/branch.events');
const ApiError = require('../../../../../core/ApiError');

class BranchService {
  async create(data) {
    const entity = await branchRepo.create(data);
    await branchCache.flushNamespace();
    publishBranchCreated(entity);
    return entity;
  }

  async getById(id) {
    return branchCache.remember(`id:${id}`, 120, async () => {
      const entity = await branchRepo.findById(id);
      if (!entity) throw ApiError.notFound('Branch not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return branchCache.remember(cacheKey, 60, () => branchRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await branchRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Branch not found');
    await branchCache.forget(`id:${id}`);
    await branchCache.flushNamespace();
    publishBranchUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await branchRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Branch not found');
    await branchCache.forget(`id:${id}`);
    await branchCache.flushNamespace();
    publishBranchDeleted(id);
    return entity;
  }
}

module.exports = new BranchService();
