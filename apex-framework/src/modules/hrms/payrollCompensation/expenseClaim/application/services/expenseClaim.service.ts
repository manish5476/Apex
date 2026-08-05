const expenseClaimRepo = require('../../domain/repositories/expenseClaim.repository');
const expenseClaimCache = require('../../cache/expenseClaim.cache');
const {
  publishExpenseClaimCreated,
  publishExpenseClaimUpdated,
  publishExpenseClaimDeleted,
} = require('../../events/expenseClaim.events');
const ApiError = require('../../../../../../core/ApiError');

class ExpenseClaimService {
  async create(data) {
    const entity = await expenseClaimRepo.create(data);
    await expenseClaimCache.flushNamespace();
    publishExpenseClaimCreated(entity);
    return entity;
  }

  async getById(id) {
    return expenseClaimCache.remember(`id:${id}`, 120, async () => {
      const entity = await expenseClaimRepo.findById(id);
      if (!entity) throw ApiError.notFound('ExpenseClaim not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return expenseClaimCache.remember(cacheKey, 60, () => expenseClaimRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await expenseClaimRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('ExpenseClaim not found');
    await expenseClaimCache.forget(`id:${id}`);
    await expenseClaimCache.flushNamespace();
    publishExpenseClaimUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await expenseClaimRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('ExpenseClaim not found');
    await expenseClaimCache.forget(`id:${id}`);
    await expenseClaimCache.flushNamespace();
    publishExpenseClaimDeleted(id);
    return entity;
  }
}

module.exports = new ExpenseClaimService();
