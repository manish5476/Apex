const attendanceSummaryRepo = require('../../domain/repositories/attendanceSummary.repository');
const attendanceSummaryCache = require('../../cache/attendanceSummary.cache');
const {
  publishAttendanceSummaryCreated,
  publishAttendanceSummaryUpdated,
  publishAttendanceSummaryDeleted,
} = require('../../events/attendanceSummary.events');
const ApiError = require('../../../../../../core/ApiError');

class AttendanceSummaryService {
  async create(data) {
    const entity = await attendanceSummaryRepo.create(data);
    await attendanceSummaryCache.flushNamespace();
    publishAttendanceSummaryCreated(entity);
    return entity;
  }

  async getById(id) {
    return attendanceSummaryCache.remember(`id:${id}`, 120, async () => {
      const entity = await attendanceSummaryRepo.findById(id);
      if (!entity) throw ApiError.notFound('AttendanceSummary not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return attendanceSummaryCache.remember(cacheKey, 60, () => attendanceSummaryRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await attendanceSummaryRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('AttendanceSummary not found');
    await attendanceSummaryCache.forget(`id:${id}`);
    await attendanceSummaryCache.flushNamespace();
    publishAttendanceSummaryUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await attendanceSummaryRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('AttendanceSummary not found');
    await attendanceSummaryCache.forget(`id:${id}`);
    await attendanceSummaryCache.flushNamespace();
    publishAttendanceSummaryDeleted(id);
    return entity;
  }
}

module.exports = new AttendanceSummaryService();
