const leaveRequestRepo = require('../../domain/repositories/leaveRequest.repository');
const leaveRequestCache = require('../../cache/leaveRequest.cache');
const {
  publishLeaveRequestCreated,
  publishLeaveRequestUpdated,
  publishLeaveRequestDeleted,
} = require('../../events/leaveRequest.events');
const ApiError = require('../../../../../../core/ApiError');

class LeaveRequestService {
  async create(data) {
    const entity = await leaveRequestRepo.create(data);
    await leaveRequestCache.flushNamespace();
    publishLeaveRequestCreated(entity);
    return entity;
  }

  async getById(id) {
    return leaveRequestCache.remember(`id:${id}`, 120, async () => {
      const entity = await leaveRequestRepo.findById(id);
      if (!entity) throw ApiError.notFound('LeaveRequest not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return leaveRequestCache.remember(cacheKey, 60, () => leaveRequestRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await leaveRequestRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('LeaveRequest not found');
    await leaveRequestCache.forget(`id:${id}`);
    await leaveRequestCache.flushNamespace();
    publishLeaveRequestUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await leaveRequestRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('LeaveRequest not found');
    await leaveRequestCache.forget(`id:${id}`);
    await leaveRequestCache.flushNamespace();
    publishLeaveRequestDeleted(id);
    return entity;
  }
}

module.exports = new LeaveRequestService();
