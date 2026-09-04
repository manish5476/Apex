const departmentRepo = require('../../domain/repositories/department.repository');
const departmentCache = require('../../cache/department.cache');
const {
  publishDepartmentCreated,
  publishDepartmentUpdated,
  publishDepartmentDeleted,
} = require('../../events/department.events');
const ApiError = require('../../../../../../core/ApiError');

class DepartmentService {
  async create(data) {
    const entity = await departmentRepo.create(data);
    await departmentCache.flushNamespace();
    publishDepartmentCreated(entity);
    return entity;
  }

  async getById(id) {
    return departmentCache.remember(`id:${id}`, 120, async () => {
      const entity = await departmentRepo.findById(id);
      if (!entity) throw ApiError.notFound('Department not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return departmentCache.remember(cacheKey, 60, () => departmentRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await departmentRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Department not found');
    await departmentCache.forget(`id:${id}`);
    await departmentCache.flushNamespace();
    publishDepartmentUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await departmentRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Department not found');
    await departmentCache.forget(`id:${id}`);
    await departmentCache.flushNamespace();
    publishDepartmentDeleted(id);
    return entity;
  }
}

module.exports = new DepartmentService();
