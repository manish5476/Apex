const driverRepo = require('../../domain/repositories/driver.repository');
const driverCache = require('../../cache/driver.cache');
const {
  publishDriverCreated,
  publishDriverUpdated,
  publishDriverDeleted,
} = require('../../events/driver.events');
const ApiError = require('../../../../../core/ApiError');

class DriverService {
  async create(data) {
    const entity = await driverRepo.create(data);
    await driverCache.flushNamespace();
    publishDriverCreated(entity);
    return entity;
  }

  async getById(id) {
    return driverCache.remember(`id:${id}`, 120, async () => {
      const entity = await driverRepo.findById(id);
      if (!entity) throw ApiError.notFound('Driver not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return driverCache.remember(cacheKey, 60, () => driverRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await driverRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Driver not found');
    await driverCache.forget(`id:${id}`);
    await driverCache.flushNamespace();
    publishDriverUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await driverRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Driver not found');
    await driverCache.forget(`id:${id}`);
    await driverCache.flushNamespace();
    publishDriverDeleted(id);
    return entity;
  }
}

module.exports = new DriverService();
