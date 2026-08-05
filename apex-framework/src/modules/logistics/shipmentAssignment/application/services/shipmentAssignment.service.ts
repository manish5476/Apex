const shipmentAssignmentRepo = require('../../domain/repositories/shipmentAssignment.repository');
const shipmentAssignmentCache = require('../../cache/shipmentAssignment.cache');
const {
  publishShipmentAssignmentCreated,
  publishShipmentAssignmentUpdated,
  publishShipmentAssignmentDeleted,
} = require('../../events/shipmentAssignment.events');
const ApiError = require('../../../../../core/ApiError');

class ShipmentAssignmentService {
  async create(data) {
    const entity = await shipmentAssignmentRepo.create(data);
    await shipmentAssignmentCache.flushNamespace();
    publishShipmentAssignmentCreated(entity);
    return entity;
  }

  async getById(id) {
    return shipmentAssignmentCache.remember(`id:${id}`, 120, async () => {
      const entity = await shipmentAssignmentRepo.findById(id);
      if (!entity) throw ApiError.notFound('ShipmentAssignment not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return shipmentAssignmentCache.remember(cacheKey, 60, () => shipmentAssignmentRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await shipmentAssignmentRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('ShipmentAssignment not found');
    await shipmentAssignmentCache.forget(`id:${id}`);
    await shipmentAssignmentCache.flushNamespace();
    publishShipmentAssignmentUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await shipmentAssignmentRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('ShipmentAssignment not found');
    await shipmentAssignmentCache.forget(`id:${id}`);
    await shipmentAssignmentCache.flushNamespace();
    publishShipmentAssignmentDeleted(id);
    return entity;
  }
}

module.exports = new ShipmentAssignmentService();
