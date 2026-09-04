const productRepo = require('../../domain/repositories/product.repository');
const productCache = require('../../cache/product.cache');
const {
  publishProductCreated,
  publishProductUpdated,
  publishProductDeleted,
  publishLowStock,
} = require('../../events/product.events');
const ApiError = require('../../../../core/ApiError');

const LOW_STOCK_THRESHOLD = 5;

class ProductService {
  async create(data) {
    const existing = await productRepo.findBySku(data.sku);
    if (existing) throw ApiError.conflict(`SKU "${data.sku}" already exists`);

    const product = await productRepo.create(data);
    await productCache.flushNamespace(); // list caches are now stale
    publishProductCreated(product);
    return product;
  }

  async getById(id) {
    return productCache.remember(`id:${id}`, 120, async () => {
      const product = await productRepo.findById(id);
      if (!product) throw ApiError.notFound('Product not found');
      return product;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return productCache.remember(cacheKey, 60, () => productRepo.find(filters, options));
  }

  async update(id, updates) {
    const product = await productRepo.updateById(id, updates);
    if (!product) throw ApiError.notFound('Product not found');

    await productCache.forget(`id:${id}`);
    await productCache.flushNamespace();
    publishProductUpdated(product);
    return product;
  }

  async remove(id) {
    const product = await productRepo.deleteById(id);
    if (!product) throw ApiError.notFound('Product not found');

    await productCache.forget(`id:${id}`);
    await productCache.flushNamespace();
    publishProductDeleted(id);
    return product;
  }

  /**
   * Example of a domain rule that goes beyond plain CRUD:
   * decrement stock, and fire an event if it drops below threshold.
   * This is the kind of logic that stays in the service (or a domain/
   * folder if a module grows complex enough to need one) rather than
   * living inline in the controller.
   */
  async reduceStock(id, quantity) {
    if (quantity <= 0) throw ApiError.badRequest('Quantity must be positive');

    const product = await productRepo.decrementStock(id, quantity);
    if (!product) {
      throw ApiError.badRequest('Insufficient stock or product not found');
    }

    await productCache.forget(`id:${id}`);

    if (product.stock <= LOW_STOCK_THRESHOLD) {
      publishLowStock(product);
    }

    return product;
  }

  async search(term, options) {
    return productRepo.search(term, options);
  }
}

module.exports = new ProductService();
