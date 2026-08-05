const shipmentEventRepo = require('../../domain/repositories/shipmentEvent.repository');
const shipmentEventCache = require('../../cache/shipmentEvent.cache');
const {
  publishShipmentEventCreated,
  publishShipmentEventUpdated,
  publishShipmentEventDeleted,
} = require('../../events/shipmentEvent.events');
const ApiError = require('../../../../../core/ApiError');

class ShipmentEventService {
  async create(data) {
    const entity = await shipmentEventRepo.create(data);
    await shipmentEventCache.flushNamespace();
    publishShipmentEventCreated(entity);
    return entity;
  }

  async getById(id) {
    return shipmentEventCache.remember(`id:${id}`, 120, async () => {
      const entity = await shipmentEventRepo.findById(id);
      if (!entity) throw ApiError.notFound('ShipmentEvent not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return shipmentEventCache.remember(cacheKey, 60, () => shipmentEventRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await shipmentEventRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('ShipmentEvent not found');
    await shipmentEventCache.forget(`id:${id}`);
    await shipmentEventCache.flushNamespace();
    publishShipmentEventUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await shipmentEventRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('ShipmentEvent not found');
    await shipmentEventCache.forget(`id:${id}`);
    await shipmentEventCache.flushNamespace();
    publishShipmentEventDeleted(id);
    return entity;
  }
}

module.exports = new ShipmentEventService();
