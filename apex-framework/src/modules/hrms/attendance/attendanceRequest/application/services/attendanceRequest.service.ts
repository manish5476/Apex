const attendanceRequestRepo = require('../../domain/repositories/attendanceRequest.repository');
const attendanceRequestCache = require('../../cache/attendanceRequest.cache');
const {
  publishAttendanceRequestCreated,
  publishAttendanceRequestUpdated,
  publishAttendanceRequestDeleted,
} = require('../../events/attendanceRequest.events');
const ApiError = require('../../../../../../core/ApiError');

class AttendanceRequestService {
  async create(data) {
    const entity = await attendanceRequestRepo.create(data);
    await attendanceRequestCache.flushNamespace();
    publishAttendanceRequestCreated(entity);
    return entity;
  }

  async getById(id) {
    return attendanceRequestCache.remember(`id:${id}`, 120, async () => {
      const entity = await attendanceRequestRepo.findById(id);
      if (!entity) throw ApiError.notFound('AttendanceRequest not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return attendanceRequestCache.remember(cacheKey, 60, () => attendanceRequestRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await attendanceRequestRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('AttendanceRequest not found');
    await attendanceRequestCache.forget(`id:${id}`);
    await attendanceRequestCache.flushNamespace();
    publishAttendanceRequestUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await attendanceRequestRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('AttendanceRequest not found');
    await attendanceRequestCache.forget(`id:${id}`);
    await attendanceRequestCache.flushNamespace();
    publishAttendanceRequestDeleted(id);
    return entity;
  }
}

module.exports = new AttendanceRequestService();
