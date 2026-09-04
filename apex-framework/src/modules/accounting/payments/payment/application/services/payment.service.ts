const paymentRepo = require('../../domain/repositories/payment.repository');
const paymentCache = require('../../cache/payment.cache');
const {
  publishPaymentCreated,
  publishPaymentUpdated,
  publishPaymentDeleted,
} = require('../../events/payment.events');
const ApiError = require('../../../../../../core/ApiError');

class PaymentService {
  async create(data) {
    const entity = await paymentRepo.create(data);
    await paymentCache.flushNamespace();
    publishPaymentCreated(entity);
    return entity;
  }

  async getById(id) {
    return paymentCache.remember(`id:${id}`, 120, async () => {
      const entity = await paymentRepo.findById(id);
      if (!entity) throw ApiError.notFound('Payment not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return paymentCache.remember(cacheKey, 60, () => paymentRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await paymentRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Payment not found');
    await paymentCache.forget(`id:${id}`);
    await paymentCache.flushNamespace();
    publishPaymentUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await paymentRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Payment not found');
    await paymentCache.forget(`id:${id}`);
    await paymentCache.flushNamespace();
    publishPaymentDeleted(id);
    return entity;
  }
}

module.exports = new PaymentService();
