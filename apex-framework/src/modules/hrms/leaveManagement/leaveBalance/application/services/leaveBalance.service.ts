const leaveBalanceRepo = require('../../domain/repositories/leaveBalance.repository');
const leaveBalanceCache = require('../../cache/leaveBalance.cache');
const {
  publishLeaveBalanceCreated,
  publishLeaveBalanceUpdated,
  publishLeaveBalanceDeleted,
} = require('../../events/leaveBalance.events');
const ApiError = require('../../../../../../core/ApiError');

class LeaveBalanceService {
  async create(data) {
    const entity = await leaveBalanceRepo.create(data);
    await leaveBalanceCache.flushNamespace();
    publishLeaveBalanceCreated(entity);
    return entity;
  }

  async getById(id) {
    return leaveBalanceCache.remember(`id:${id}`, 120, async () => {
      const entity = await leaveBalanceRepo.findById(id);
      if (!entity) throw ApiError.notFound('LeaveBalance not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return leaveBalanceCache.remember(cacheKey, 60, () => leaveBalanceRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await leaveBalanceRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('LeaveBalance not found');
    await leaveBalanceCache.forget(`id:${id}`);
    await leaveBalanceCache.flushNamespace();
    publishLeaveBalanceUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await leaveBalanceRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('LeaveBalance not found');
    await leaveBalanceCache.forget(`id:${id}`);
    await leaveBalanceCache.flushNamespace();
    publishLeaveBalanceDeleted(id);
    return entity;
  }
}

module.exports = new LeaveBalanceService();
