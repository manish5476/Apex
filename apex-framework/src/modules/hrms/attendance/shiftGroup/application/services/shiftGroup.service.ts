const shiftGroupRepo = require('../../domain/repositories/shiftGroup.repository');
const shiftGroupCache = require('../../cache/shiftGroup.cache');
const {
  publishShiftGroupCreated,
  publishShiftGroupUpdated,
  publishShiftGroupDeleted,
} = require('../../events/shiftGroup.events');
const ApiError = require('../../../../../../core/ApiError');

class ShiftGroupService {
  async create(data) {
    const entity = await shiftGroupRepo.create(data);
    await shiftGroupCache.flushNamespace();
    publishShiftGroupCreated(entity);
    return entity;
  }

  async getById(id) {
    return shiftGroupCache.remember(`id:${id}`, 120, async () => {
      const entity = await shiftGroupRepo.findById(id);
      if (!entity) throw ApiError.notFound('ShiftGroup not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return shiftGroupCache.remember(cacheKey, 60, () => shiftGroupRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await shiftGroupRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('ShiftGroup not found');
    await shiftGroupCache.forget(`id:${id}`);
    await shiftGroupCache.flushNamespace();
    publishShiftGroupUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await shiftGroupRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('ShiftGroup not found');
    await shiftGroupCache.forget(`id:${id}`);
    await shiftGroupCache.flushNamespace();
    publishShiftGroupDeleted(id);
    return entity;
  }
}

module.exports = new ShiftGroupService();
