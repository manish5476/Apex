const shiftAssignmentRepo = require('../../domain/repositories/shiftAssignment.repository');
const shiftAssignmentCache = require('../../cache/shiftAssignment.cache');
const {
  publishShiftAssignmentCreated,
  publishShiftAssignmentUpdated,
  publishShiftAssignmentDeleted,
} = require('../../events/shiftAssignment.events');
const ApiError = require('../../../../../../core/ApiError');

class ShiftAssignmentService {
  async create(data) {
    const entity = await shiftAssignmentRepo.create(data);
    await shiftAssignmentCache.flushNamespace();
    publishShiftAssignmentCreated(entity);
    return entity;
  }

  async getById(id) {
    return shiftAssignmentCache.remember(`id:${id}`, 120, async () => {
      const entity = await shiftAssignmentRepo.findById(id);
      if (!entity) throw ApiError.notFound('ShiftAssignment not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return shiftAssignmentCache.remember(cacheKey, 60, () => shiftAssignmentRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await shiftAssignmentRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('ShiftAssignment not found');
    await shiftAssignmentCache.forget(`id:${id}`);
    await shiftAssignmentCache.flushNamespace();
    publishShiftAssignmentUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await shiftAssignmentRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('ShiftAssignment not found');
    await shiftAssignmentCache.forget(`id:${id}`);
    await shiftAssignmentCache.flushNamespace();
    publishShiftAssignmentDeleted(id);
    return entity;
  }
}

module.exports = new ShiftAssignmentService();
