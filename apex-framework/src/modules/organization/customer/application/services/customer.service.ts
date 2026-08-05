const customerRepo = require('../../domain/repositories/customer.repository');
const customerCache = require('../../cache/customer.cache');
const {
  publishCustomerCreated,
  publishCustomerUpdated,
  publishCustomerDeleted,
} = require('../../events/customer.events');
const ApiError = require('../../../../../core/ApiError');

class CustomerService {
  async create(data) {
    const entity = await customerRepo.create(data);
    await customerCache.flushNamespace();
    publishCustomerCreated(entity);
    return entity;
  }

  async getById(id) {
    return customerCache.remember(`id:${id}`, 120, async () => {
      const entity = await customerRepo.findById(id);
      if (!entity) throw ApiError.notFound('Customer not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return customerCache.remember(cacheKey, 60, () => customerRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await customerRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Customer not found');
    await customerCache.forget(`id:${id}`);
    await customerCache.flushNamespace();
    publishCustomerUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await customerRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Customer not found');
    await customerCache.forget(`id:${id}`);
    await customerCache.flushNamespace();
    publishCustomerDeleted(id);
    return entity;
  }
}

module.exports = new CustomerService();
