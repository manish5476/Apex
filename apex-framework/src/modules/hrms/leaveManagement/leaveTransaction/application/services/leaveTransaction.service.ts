const leaveTransactionRepo = require('../../domain/repositories/leaveTransaction.repository');
const leaveTransactionCache = require('../../cache/leaveTransaction.cache');
const {
  publishLeaveTransactionCreated,
  publishLeaveTransactionUpdated,
  publishLeaveTransactionDeleted,
} = require('../../events/leaveTransaction.events');
const ApiError = require('../../../../../../core/ApiError');

class LeaveTransactionService {
  async create(data) {
    const entity = await leaveTransactionRepo.create(data);
    await leaveTransactionCache.flushNamespace();
    publishLeaveTransactionCreated(entity);
    return entity;
  }

  async getById(id) {
    return leaveTransactionCache.remember(`id:${id}`, 120, async () => {
      const entity = await leaveTransactionRepo.findById(id);
      if (!entity) throw ApiError.notFound('LeaveTransaction not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return leaveTransactionCache.remember(cacheKey, 60, () => leaveTransactionRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await leaveTransactionRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('LeaveTransaction not found');
    await leaveTransactionCache.forget(`id:${id}`);
    await leaveTransactionCache.flushNamespace();
    publishLeaveTransactionUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await leaveTransactionRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('LeaveTransaction not found');
    await leaveTransactionCache.forget(`id:${id}`);
    await leaveTransactionCache.flushNamespace();
    publishLeaveTransactionDeleted(id);
    return entity;
  }
}

module.exports = new LeaveTransactionService();
