const attendanceLogRepo = require('../../domain/repositories/attendanceLog.repository');
const attendanceLogCache = require('../../cache/attendanceLog.cache');
const {
  publishAttendanceLogCreated,
  publishAttendanceLogUpdated,
  publishAttendanceLogDeleted,
} = require('../../events/attendanceLog.events');
const ApiError = require('../../../../../../core/ApiError');

class AttendanceLogService {
  async create(data) {
    const entity = await attendanceLogRepo.create(data);
    await attendanceLogCache.flushNamespace();
    publishAttendanceLogCreated(entity);
    return entity;
  }

  async getById(id) {
    return attendanceLogCache.remember(`id:${id}`, 120, async () => {
      const entity = await attendanceLogRepo.findById(id);
      if (!entity) throw ApiError.notFound('AttendanceLog not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return attendanceLogCache.remember(cacheKey, 60, () => attendanceLogRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await attendanceLogRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('AttendanceLog not found');
    await attendanceLogCache.forget(`id:${id}`);
    await attendanceLogCache.flushNamespace();
    publishAttendanceLogUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await attendanceLogRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('AttendanceLog not found');
    await attendanceLogCache.forget(`id:${id}`);
    await attendanceLogCache.flushNamespace();
    publishAttendanceLogDeleted(id);
    return entity;
  }
}

module.exports = new AttendanceLogService();
