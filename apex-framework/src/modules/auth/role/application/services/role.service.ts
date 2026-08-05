const roleRepo = require('../../domain/repositories/role.repository');
const roleCache = require('../../cache/role.cache');
const {
  publishRoleCreated,
  publishRoleUpdated,
  publishRoleDeleted,
} = require('../../events/role.events');
const ApiError = require('../../../../../core/ApiError');

class RoleService {
  async create(data) {
    const entity = await roleRepo.create(data);
    await roleCache.flushNamespace();
    publishRoleCreated(entity);
    return entity;
  }

  async getById(id) {
    return roleCache.remember(`id:${id}`, 120, async () => {
      const entity = await roleRepo.findById(id);
      if (!entity) throw ApiError.notFound('Role not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return roleCache.remember(cacheKey, 60, () => roleRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await roleRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Role not found');
    await roleCache.forget(`id:${id}`);
    await roleCache.flushNamespace();
    publishRoleUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await roleRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Role not found');
    await roleCache.forget(`id:${id}`);
    await roleCache.flushNamespace();
    publishRoleDeleted(id);
    return entity;
  }
}

module.exports = new RoleService();
