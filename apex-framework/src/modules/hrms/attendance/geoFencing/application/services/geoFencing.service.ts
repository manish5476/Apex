const geoFencingRepo = require('../../domain/repositories/geoFencing.repository');
const geoFencingCache = require('../../cache/geoFencing.cache');
const {
  publishGeoFencingCreated,
  publishGeoFencingUpdated,
  publishGeoFencingDeleted,
} = require('../../events/geoFencing.events');
const ApiError = require('../../../../../../core/ApiError');

class GeoFencingService {
  async create(data) {
    const entity = await geoFencingRepo.create(data);
    await geoFencingCache.flushNamespace();
    publishGeoFencingCreated(entity);
    return entity;
  }

  async getById(id) {
    return geoFencingCache.remember(`id:${id}`, 120, async () => {
      const entity = await geoFencingRepo.findById(id);
      if (!entity) throw ApiError.notFound('GeoFencing not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return geoFencingCache.remember(cacheKey, 60, () => geoFencingRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await geoFencingRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('GeoFencing not found');
    await geoFencingCache.forget(`id:${id}`);
    await geoFencingCache.flushNamespace();
    publishGeoFencingUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await geoFencingRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('GeoFencing not found');
    await geoFencingCache.forget(`id:${id}`);
    await geoFencingCache.flushNamespace();
    publishGeoFencingDeleted(id);
    return entity;
  }
}

module.exports = new GeoFencingService();
