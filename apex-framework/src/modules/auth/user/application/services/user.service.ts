const userRepo = require('../../domain/repositories/user.repository');
const userCache = require('../../cache/user.cache');
const {
  publishUserCreated,
  publishUserUpdated,
  publishUserDeleted,
} = require('../../events/user.events');
const ApiError = require('../../../../../core/ApiError');

class UserService {
  async create(data) {
    const entity = await userRepo.create(data);
    await userCache.flushNamespace();
    publishUserCreated(entity);
    return entity;
  }

  async getById(id) {
    return userCache.remember(`id:${id}`, 120, async () => {
      const entity = await userRepo.findById(id);
      if (!entity) throw ApiError.notFound('User not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return userCache.remember(cacheKey, 60, () => userRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await userRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('User not found');
    await userCache.forget(`id:${id}`);
    await userCache.flushNamespace();
    publishUserUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await userRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('User not found');
    await userCache.forget(`id:${id}`);
    await userCache.flushNamespace();
    publishUserDeleted(id);
    return entity;
  }
}

module.exports = new UserService();
