const accountRepo = require('../../domain/repositories/account.repository');
const accountCache = require('../../cache/account.cache');
const {
  publishAccountCreated,
  publishAccountUpdated,
  publishAccountDeleted,
} = require('../../events/account.events');
const ApiError = require('../../../../../../core/ApiError');

class AccountService {
  async create(data) {
    const entity = await accountRepo.create(data);
    await accountCache.flushNamespace();
    publishAccountCreated(entity);
    return entity;
  }

  async getById(id) {
    return accountCache.remember(`id:${id}`, 120, async () => {
      const entity = await accountRepo.findById(id);
      if (!entity) throw ApiError.notFound('Account not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return accountCache.remember(cacheKey, 60, () => accountRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await accountRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Account not found');
    await accountCache.forget(`id:${id}`);
    await accountCache.flushNamespace();
    publishAccountUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await accountRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Account not found');
    await accountCache.forget(`id:${id}`);
    await accountCache.flushNamespace();
    publishAccountDeleted(id);
    return entity;
  }
}

module.exports = new AccountService();
