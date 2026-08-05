const accountEntryRepo = require('../../domain/repositories/accountEntry.repository');
const accountEntryCache = require('../../cache/accountEntry.cache');
const {
  publishAccountEntryCreated,
  publishAccountEntryUpdated,
  publishAccountEntryDeleted,
} = require('../../events/accountEntry.events');
const ApiError = require('../../../../../../core/ApiError');

class AccountEntryService {
  async create(data) {
    const entity = await accountEntryRepo.create(data);
    await accountEntryCache.flushNamespace();
    publishAccountEntryCreated(entity);
    return entity;
  }

  async getById(id) {
    return accountEntryCache.remember(`id:${id}`, 120, async () => {
      const entity = await accountEntryRepo.findById(id);
      if (!entity) throw ApiError.notFound('AccountEntry not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return accountEntryCache.remember(cacheKey, 60, () => accountEntryRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await accountEntryRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('AccountEntry not found');
    await accountEntryCache.forget(`id:${id}`);
    await accountEntryCache.flushNamespace();
    publishAccountEntryUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await accountEntryRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('AccountEntry not found');
    await accountEntryCache.forget(`id:${id}`);
    await accountEntryCache.flushNamespace();
    publishAccountEntryDeleted(id);
    return entity;
  }
}

module.exports = new AccountEntryService();
