const uploadsRepo = require('../../domain/repositories/uploads.repository');
const uploadsCache = require('../../cache/uploads.cache');
const {
  publishUploadsCreated,
  publishUploadsUpdated,
  publishUploadsDeleted,
} = require('../../events/uploads.events');
const ApiError = require('../../../../core/ApiError');

class UploadsService {
  async create(data) {
    const entity = await uploadsRepo.create(data);
    await uploadsCache.flushNamespace();
    publishUploadsCreated(entity);
    return entity;
  }

  async getById(id) {
    return uploadsCache.remember(`id:${id}`, 120, async () => {
      const entity = await uploadsRepo.findById(id);
      if (!entity) throw ApiError.notFound('Uploads not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return uploadsCache.remember(cacheKey, 60, () => uploadsRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await uploadsRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Uploads not found');
    await uploadsCache.forget(`id:${id}`);
    await uploadsCache.flushNamespace();
    publishUploadsUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await uploadsRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Uploads not found');
    await uploadsCache.forget(`id:${id}`);
    await uploadsCache.flushNamespace();
    publishUploadsDeleted(id);
    return entity;
  }
}

module.exports = new UploadsService();
