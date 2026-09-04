const vehicleRepo = require('../../domain/repositories/vehicle.repository');
const vehicleCache = require('../../cache/vehicle.cache');
const {
  publishVehicleCreated,
  publishVehicleUpdated,
  publishVehicleDeleted,
} = require('../../events/vehicle.events');
const ApiError = require('../../../../../core/ApiError');

class VehicleService {
  async create(data) {
    const entity = await vehicleRepo.create(data);
    await vehicleCache.flushNamespace();
    publishVehicleCreated(entity);
    return entity;
  }

  async getById(id) {
    return vehicleCache.remember(`id:${id}`, 120, async () => {
      const entity = await vehicleRepo.findById(id);
      if (!entity) throw ApiError.notFound('Vehicle not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return vehicleCache.remember(cacheKey, 60, () => vehicleRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await vehicleRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Vehicle not found');
    await vehicleCache.forget(`id:${id}`);
    await vehicleCache.flushNamespace();
    publishVehicleUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await vehicleRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Vehicle not found');
    await vehicleCache.forget(`id:${id}`);
    await vehicleCache.flushNamespace();
    publishVehicleDeleted(id);
    return entity;
  }
}

module.exports = new VehicleService();
