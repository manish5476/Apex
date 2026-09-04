const holidayRepo = require('../../domain/repositories/holiday.repository');
const holidayCache = require('../../cache/holiday.cache');
const {
  publishHolidayCreated,
  publishHolidayUpdated,
  publishHolidayDeleted,
} = require('../../events/holiday.events');
const ApiError = require('../../../../../../core/ApiError');

class HolidayService {
  async create(data) {
    const entity = await holidayRepo.create(data);
    await holidayCache.flushNamespace();
    publishHolidayCreated(entity);
    return entity;
  }

  async getById(id) {
    return holidayCache.remember(`id:${id}`, 120, async () => {
      const entity = await holidayRepo.findById(id);
      if (!entity) throw ApiError.notFound('Holiday not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return holidayCache.remember(cacheKey, 60, () => holidayRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await holidayRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Holiday not found');
    await holidayCache.forget(`id:${id}`);
    await holidayCache.flushNamespace();
    publishHolidayUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await holidayRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Holiday not found');
    await holidayCache.forget(`id:${id}`);
    await holidayCache.flushNamespace();
    publishHolidayDeleted(id);
    return entity;
  }
}

module.exports = new HolidayService();
