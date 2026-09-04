const attendanceMachineRepo = require('../../domain/repositories/attendanceMachine.repository');
const attendanceMachineCache = require('../../cache/attendanceMachine.cache');
const {
  publishAttendanceMachineCreated,
  publishAttendanceMachineUpdated,
  publishAttendanceMachineDeleted,
} = require('../../events/attendanceMachine.events');
const ApiError = require('../../../../../../core/ApiError');

class AttendanceMachineService {
  async create(data) {
    const entity = await attendanceMachineRepo.create(data);
    await attendanceMachineCache.flushNamespace();
    publishAttendanceMachineCreated(entity);
    return entity;
  }

  async getById(id) {
    return attendanceMachineCache.remember(`id:${id}`, 120, async () => {
      const entity = await attendanceMachineRepo.findById(id);
      if (!entity) throw ApiError.notFound('AttendanceMachine not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return attendanceMachineCache.remember(cacheKey, 60, () => attendanceMachineRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await attendanceMachineRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('AttendanceMachine not found');
    await attendanceMachineCache.forget(`id:${id}`);
    await attendanceMachineCache.flushNamespace();
    publishAttendanceMachineUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await attendanceMachineRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('AttendanceMachine not found');
    await attendanceMachineCache.forget(`id:${id}`);
    await attendanceMachineCache.flushNamespace();
    publishAttendanceMachineDeleted(id);
    return entity;
  }
}

module.exports = new AttendanceMachineService();
