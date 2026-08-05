const productRepo = require('../../domain/repositories/product.repository');
const productCache = require('../../cache/product.cache');
const {
  publishProductCreated,
  publishProductUpdated,
  publishProductDeleted,
} = require('../../events/product.events');
const ApiError = require('../../../../../core/ApiError');

class ProductService {
  async create(data) {
    const entity = await productRepo.create(data);
    await productCache.flushNamespace();
    publishProductCreated(entity);
    return entity;
  }

  async getById(id) {
    return productCache.remember(`id:${id}`, 120, async () => {
      const entity = await productRepo.findById(id);
      if (!entity) throw ApiError.notFound('Product not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return productCache.remember(cacheKey, 60, () => productRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await productRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Product not found');
    await productCache.forget(`id:${id}`);
    await productCache.flushNamespace();
    publishProductUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await productRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Product not found');
    await productCache.forget(`id:${id}`);
    await productCache.flushNamespace();
    publishProductDeleted(id);
    return entity;
  }
}

module.exports = new ProductService();
