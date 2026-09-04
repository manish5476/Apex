const employeeDocumentRepo = require('../../domain/repositories/employeeDocument.repository');
const employeeDocumentCache = require('../../cache/employeeDocument.cache');
const {
  publishEmployeeDocumentCreated,
  publishEmployeeDocumentUpdated,
  publishEmployeeDocumentDeleted,
} = require('../../events/employeeDocument.events');
const ApiError = require('../../../../../../core/ApiError');

class EmployeeDocumentService {
  async create(data) {
    const entity = await employeeDocumentRepo.create(data);
    await employeeDocumentCache.flushNamespace();
    publishEmployeeDocumentCreated(entity);
    return entity;
  }

  async getById(id) {
    return employeeDocumentCache.remember(`id:${id}`, 120, async () => {
      const entity = await employeeDocumentRepo.findById(id);
      if (!entity) throw ApiError.notFound('EmployeeDocument not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return employeeDocumentCache.remember(cacheKey, 60, () => employeeDocumentRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await employeeDocumentRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('EmployeeDocument not found');
    await employeeDocumentCache.forget(`id:${id}`);
    await employeeDocumentCache.flushNamespace();
    publishEmployeeDocumentUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await employeeDocumentRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('EmployeeDocument not found');
    await employeeDocumentCache.forget(`id:${id}`);
    await employeeDocumentCache.flushNamespace();
    publishEmployeeDocumentDeleted(id);
    return entity;
  }
}

module.exports = new EmployeeDocumentService();
