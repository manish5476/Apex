const payslipRepo = require('../../domain/repositories/payslip.repository');
const payslipCache = require('../../cache/payslip.cache');
const {
  publishPayslipCreated,
  publishPayslipUpdated,
  publishPayslipDeleted,
} = require('../../events/payslip.events');
const ApiError = require('../../../../../../core/ApiError');

class PayslipService {
  async create(data) {
    const entity = await payslipRepo.create(data);
    await payslipCache.flushNamespace();
    publishPayslipCreated(entity);
    return entity;
  }

  async getById(id) {
    return payslipCache.remember(`id:${id}`, 120, async () => {
      const entity = await payslipRepo.findById(id);
      if (!entity) throw ApiError.notFound('Payslip not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return payslipCache.remember(cacheKey, 60, () => payslipRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await payslipRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Payslip not found');
    await payslipCache.forget(`id:${id}`);
    await payslipCache.flushNamespace();
    publishPayslipUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await payslipRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Payslip not found');
    await payslipCache.forget(`id:${id}`);
    await payslipCache.flushNamespace();
    publishPayslipDeleted(id);
    return entity;
  }
}

module.exports = new PayslipService();
