const shipmentRepo = require('../../domain/repositories/shipment.repository');
const shipmentCache = require('../../cache/shipment.cache');
const {
  publishShipmentCreated,
  publishShipmentUpdated,
  publishShipmentDeleted,
} = require('../../events/shipment.events');
const ApiError = require('../../../../../core/ApiError');

class ShipmentService {
  async create(data) {
    const entity = await shipmentRepo.create(data);
    await shipmentCache.flushNamespace();
    publishShipmentCreated(entity);
    return entity;
  }

  async getById(id) {
    return shipmentCache.remember(`id:${id}`, 120, async () => {
      const entity = await shipmentRepo.findById(id);
      if (!entity) throw ApiError.notFound('Shipment not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return shipmentCache.remember(cacheKey, 60, () => shipmentRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await shipmentRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Shipment not found');
    await shipmentCache.forget(`id:${id}`);
    await shipmentCache.flushNamespace();
    publishShipmentUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await shipmentRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Shipment not found');
    await shipmentCache.forget(`id:${id}`);
    await shipmentCache.flushNamespace();
    publishShipmentDeleted(id);
    return entity;
  }
}

module.exports = new ShipmentService();
