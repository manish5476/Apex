const employeeRepo = require('../../domain/repositories/employee.repository');
const employeeCache = require('../../cache/employee.cache');
const {
  publishEmployeeCreated,
  publishEmployeeUpdated,
  publishEmployeeDeleted,
} = require('../../events/employee.events');
const ApiError = require('../../../../../../core/ApiError');

class EmployeeService {
  async create(data) {
    const entity = await employeeRepo.create(data);
    await employeeCache.flushNamespace();
    publishEmployeeCreated(entity);
    return entity;
  }

  async getById(id) {
    return employeeCache.remember(`id:${id}`, 120, async () => {
      const entity = await employeeRepo.findById(id);
      if (!entity) throw ApiError.notFound('Employee not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return employeeCache.remember(cacheKey, 60, () => employeeRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await employeeRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Employee not found');
    await employeeCache.forget(`id:${id}`);
    await employeeCache.flushNamespace();
    publishEmployeeUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await employeeRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Employee not found');
    await employeeCache.forget(`id:${id}`);
    await employeeCache.flushNamespace();
    publishEmployeeDeleted(id);
    return entity;
  }
}

module.exports = new EmployeeService();
