const shipmentActivityRepo = require('../../domain/repositories/shipmentActivity.repository');
const shipmentActivityCache = require('../../cache/shipmentActivity.cache');
const {
  publishShipmentActivityCreated,
  publishShipmentActivityUpdated,
  publishShipmentActivityDeleted,
} = require('../../events/shipmentActivity.events');
const ApiError = require('../../../../../core/ApiError');

class ShipmentActivityService {
  async create(data) {
    const entity = await shipmentActivityRepo.create(data);
    await shipmentActivityCache.flushNamespace();
    publishShipmentActivityCreated(entity);
    return entity;
  }

  async getById(id) {
    return shipmentActivityCache.remember(`id:${id}`, 120, async () => {
      const entity = await shipmentActivityRepo.findById(id);
      if (!entity) throw ApiError.notFound('ShipmentActivity not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return shipmentActivityCache.remember(cacheKey, 60, () => shipmentActivityRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await shipmentActivityRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('ShipmentActivity not found');
    await shipmentActivityCache.forget(`id:${id}`);
    await shipmentActivityCache.flushNamespace();
    publishShipmentActivityUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await shipmentActivityRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('ShipmentActivity not found');
    await shipmentActivityCache.forget(`id:${id}`);
    await shipmentActivityCache.flushNamespace();
    publishShipmentActivityDeleted(id);
    return entity;
  }
}

module.exports = new ShipmentActivityService();
