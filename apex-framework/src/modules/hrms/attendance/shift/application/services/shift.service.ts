const shiftRepo = require('../../domain/repositories/shift.repository');
const shiftCache = require('../../cache/shift.cache');
const {
  publishShiftCreated,
  publishShiftUpdated,
  publishShiftDeleted,
} = require('../../events/shift.events');
const ApiError = require('../../../../../../core/ApiError');

class ShiftService {
  async create(data) {
    const entity = await shiftRepo.create(data);
    await shiftCache.flushNamespace();
    publishShiftCreated(entity);
    return entity;
  }

  async getById(id) {
    return shiftCache.remember(`id:${id}`, 120, async () => {
      const entity = await shiftRepo.findById(id);
      if (!entity) throw ApiError.notFound('Shift not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return shiftCache.remember(cacheKey, 60, () => shiftRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await shiftRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Shift not found');
    await shiftCache.forget(`id:${id}`);
    await shiftCache.flushNamespace();
    publishShiftUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await shiftRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Shift not found');
    await shiftCache.forget(`id:${id}`);
    await shiftCache.flushNamespace();
    publishShiftDeleted(id);
    return entity;
  }
}

module.exports = new ShiftService();
