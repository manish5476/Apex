const invoiceAuditRepo = require('../../domain/repositories/invoiceAudit.repository');
const invoiceAuditCache = require('../../cache/invoiceAudit.cache');
const {
  publishInvoiceAuditCreated,
  publishInvoiceAuditUpdated,
  publishInvoiceAuditDeleted,
} = require('../../events/invoiceAudit.events');
const ApiError = require('../../../../../../core/ApiError');

class InvoiceAuditService {
  async create(data) {
    const entity = await invoiceAuditRepo.create(data);
    await invoiceAuditCache.flushNamespace();
    publishInvoiceAuditCreated(entity);
    return entity;
  }

  async getById(id) {
    return invoiceAuditCache.remember(`id:${id}`, 120, async () => {
      const entity = await invoiceAuditRepo.findById(id);
      if (!entity) throw ApiError.notFound('InvoiceAudit not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return invoiceAuditCache.remember(cacheKey, 60, () => invoiceAuditRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await invoiceAuditRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('InvoiceAudit not found');
    await invoiceAuditCache.forget(`id:${id}`);
    await invoiceAuditCache.flushNamespace();
    publishInvoiceAuditUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await invoiceAuditRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('InvoiceAudit not found');
    await invoiceAuditCache.forget(`id:${id}`);
    await invoiceAuditCache.flushNamespace();
    publishInvoiceAuditDeleted(id);
    return entity;
  }
}

module.exports = new InvoiceAuditService();
