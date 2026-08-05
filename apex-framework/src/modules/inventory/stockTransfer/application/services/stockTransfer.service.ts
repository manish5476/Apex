const stockTransferRepo = require('../../domain/repositories/stockTransfer.repository');
const stockTransferCache = require('../../cache/stockTransfer.cache');
const {
  publishStockTransferCreated,
  publishStockTransferUpdated,
  publishStockTransferDeleted,
} = require('../../events/stockTransfer.events');
const ApiError = require('../../../../../core/ApiError');

class StockTransferService {
  async create(data) {
    const entity = await stockTransferRepo.create(data);
    await stockTransferCache.flushNamespace();
    publishStockTransferCreated(entity);
    return entity;
  }

  async getById(id) {
    return stockTransferCache.remember(`id:${id}`, 120, async () => {
      const entity = await stockTransferRepo.findById(id);
      if (!entity) throw ApiError.notFound('StockTransfer not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return stockTransferCache.remember(cacheKey, 60, () => stockTransferRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await stockTransferRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('StockTransfer not found');
    await stockTransferCache.forget(`id:${id}`);
    await stockTransferCache.flushNamespace();
    publishStockTransferUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await stockTransferRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('StockTransfer not found');
    await stockTransferCache.forget(`id:${id}`);
    await stockTransferCache.flushNamespace();
    publishStockTransferDeleted(id);
    return entity;
  }
}

module.exports = new StockTransferService();
