const invoiceRepo = require('../../domain/repositories/invoice.repository');
const invoiceCache = require('../../cache/invoice.cache');
const {
  publishInvoiceCreated,
  publishInvoiceUpdated,
  publishInvoiceDeleted,
} = require('../../events/invoice.events');
const ApiError = require('../../../../../../core/ApiError');

class InvoiceService {
  async create(data) {
    const entity = await invoiceRepo.create(data);
    await invoiceCache.flushNamespace();
    publishInvoiceCreated(entity);
    return entity;
  }

  async getById(id) {
    return invoiceCache.remember(`id:${id}`, 120, async () => {
      const entity = await invoiceRepo.findById(id);
      if (!entity) throw ApiError.notFound('Invoice not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return invoiceCache.remember(cacheKey, 60, () => invoiceRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await invoiceRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Invoice not found');
    await invoiceCache.forget(`id:${id}`);
    await invoiceCache.flushNamespace();
    publishInvoiceUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await invoiceRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Invoice not found');
    await invoiceCache.forget(`id:${id}`);
    await invoiceCache.flushNamespace();
    publishInvoiceDeleted(id);
    return entity;
  }
}

module.exports = new InvoiceService();
