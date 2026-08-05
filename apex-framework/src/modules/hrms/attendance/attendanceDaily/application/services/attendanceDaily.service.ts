const attendanceDailyRepo = require('../../domain/repositories/attendanceDaily.repository');
const attendanceDailyCache = require('../../cache/attendanceDaily.cache');
const {
  publishAttendanceDailyCreated,
  publishAttendanceDailyUpdated,
  publishAttendanceDailyDeleted,
} = require('../../events/attendanceDaily.events');
const ApiError = require('../../../../../../core/ApiError');

class AttendanceDailyService {
  async create(data) {
    const entity = await attendanceDailyRepo.create(data);
    await attendanceDailyCache.flushNamespace();
    publishAttendanceDailyCreated(entity);
    return entity;
  }

  async getById(id) {
    return attendanceDailyCache.remember(`id:${id}`, 120, async () => {
      const entity = await attendanceDailyRepo.findById(id);
      if (!entity) throw ApiError.notFound('AttendanceDaily not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return attendanceDailyCache.remember(cacheKey, 60, () => attendanceDailyRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await attendanceDailyRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('AttendanceDaily not found');
    await attendanceDailyCache.forget(`id:${id}`);
    await attendanceDailyCache.flushNamespace();
    publishAttendanceDailyUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await attendanceDailyRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('AttendanceDaily not found');
    await attendanceDailyCache.forget(`id:${id}`);
    await attendanceDailyCache.flushNamespace();
    publishAttendanceDailyDeleted(id);
    return entity;
  }
}

module.exports = new AttendanceDailyService();
